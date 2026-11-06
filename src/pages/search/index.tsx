import { getScrollViewType } from "../../utils/renderer";
import { View, Text, Image, ScrollView } from "@tarojs/components";
import { GzkNativeInput as Input, GzkButton as Button, GzkPicker as Picker } from "gzk-ui/native-form";
import Taro, { useRouter } from "@tarojs/taro";
import { useState, useRef, useEffect } from "react";
import {
  searchTopics,
  getSearchNodes,
  resolveSearchNode,
  resolveSearchResult,
  SearchParams,
  SearchResponse,
  SearchResult,
  NodeGroup,
} from "guanggu-forum-api";
import Navbar from "../../components/Navbar";
import ThemedIcon from "../../components/ThemedIcon";
import NodePicker from "../../components/NodePicker";
import BottomSheet from "../../components/BottomSheet";
import { getCachedNodeNavigation, fetchAndCacheNodeNavigation } from "../../utils/nodeNavigation";
import SearchHotTopics from "../../components/SearchHotTopics";
import TopicTag from "../../components/TopicTag";
import { SearchNodesUrl as NodesIcon } from "gzk-ui/icon-urls";
import { SearchHistory as HistoryIcon } from "gzk-ui/icons";
import { Trash as TrashIcon } from "gzk-ui/icons";
import { SearchFilter as FilterIcon } from "gzk-ui/icons";
import { clearSearchHistory, getSearchHistory, rememberSearch, splitSearchHighlight } from "../../utils/searchPresentation";
import { SearchSort as SortIcon } from "gzk-ui/icons";
import { Search as SearchIcon } from "gzk-ui/icons";
import { useSearchPlaceholder } from "../../hooks/useSearchPlaceholder";
import { decodeSearchRouteValue, getPlaceholderTopicRoute } from "../../utils/searchRoute";
import { isSkyline } from "../../utils/renderer";
import { getSearchPreferences, saveSearchPreferences } from "../../utils/searchPreferences";
import "./index.scss";

const sorts = [
  { value: "relevance", label: "相关性" },
  { value: "newest", label: "最新主题" },
] as const;
const resultTabs = [
  { value: "all", label: "全部" },
  { value: "title", label: "标题" },
  { value: "topic", label: "正文" },
  { value: "reply", label: "回复" },
] as const;

const highlightedText = (text: string, query: string) => splitSearchHighlight(text, query).map((part, index) => (
  <Text key={index} className={part.highlighted ? "searchHighlight" : undefined}>{part.text}</Text>
));

const defaultFilters: Omit<SearchParams, "q"> = {
  scope: "all", sort: "relevance", node: "0", author: "", since: "", until: "",
};

export default function Search() {
  const skyline = isSkyline();
  const routeNode = decodeSearchRouteValue(useRouter().params.node);
  const [keyword, setKeyword] = useState("");
  const { placeholder, topic: placeholderTopic } = useSearchPlaceholder(!keyword.trim());
  const [nodeReady, setNodeReady] = useState(!routeNode);
  const [nodeError, setNodeError] = useState("");
  const [filters, setFilters] = useState(() => ({ ...defaultFilters, ...getSearchPreferences() }));
  const [advanced, setAdvanced] = useState(false);
  const [response, setResponse] = useState<SearchResponse>();
  const [nodes, setNodes] = useState([{ value: "0", label: "全部节点" }]);
  const [nodeGroups, setNodeGroups] = useState<NodeGroup[]>(getCachedNodeNavigation);
  const [nodePickerVisible, setNodePickerVisible] = useState(false);
  const [nodePickerLoading, setNodePickerLoading] = useState(false);
  const [nodePickerError, setNodePickerError] = useState("");
  const nodeRequestId = useRef(0);
  const nodePickerRequestId = useRef(0);
  const nodeTarget = useRef(routeNode || "0");
  const autoSearchTimer = useRef<ReturnType<typeof setTimeout>>();
  const filtersRef = useRef(filters);
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState("");
  const requestId = useRef(0);
  const mounted = useRef(true);
  const openingRef = useRef(false);
  const openingId = useRef(0);
  const submitted = useRef<SearchParams>();
  const [resultScrollTop, setResultScrollTop] = useState(0);
  const showHotTopics = !loading && !error && !response;
  const [history, setHistory] = useState(getSearchHistory);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(autoSearchTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!routeNode) return;
    void selectSearchNode(routeNode, false);
    const requests = nodeRequestId;
    return () => { requests.current++; };
    // Only initialize route context; user filter changes search through their handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeNode]);

  const invalidateOpening = () => {
    openingId.current++;
    openingRef.current = false;
    setOpening("");
  };

  const invalidate = () => {
    clearTimeout(autoSearchTimer.current);
    requestId.current++;
    invalidateOpening();
    setLoading(false);
    setResponse(undefined);
    setError("");
    submitted.current = undefined;
  };

  const changeFilter = (update: Partial<typeof filters>, delay = 0, ready = nodeReady) => {
    const current = filtersRef.current;
    if (nodeReady === ready && !Object.entries(update).some(([key, value]) => current[key] !== value)) return;
    const next = { ...current, ...update };
    invalidate();
    filtersRef.current = next;
    setFilters(next);
    if (next.scope !== current.scope || next.sort !== current.sort) saveSearchPreferences(next);
    if (!keywordRef.current.trim() || !ready) return;
    if (delay) {
      autoSearchTimer.current = setTimeout(() => {
        void runSearch({ ...next, q: keywordRef.current, page: 1 }, ready);
      }, delay);
    } else {
      void runSearch({ ...next, q: keywordRef.current, page: 1 }, ready);
    }
  };

  const selectSearchNode = async (slug: string, userChange = true) => {
    if (userChange && nodeReady && (slug === nodeTarget.current || slug === filtersRef.current.node || slug === selectedSlug)) {
      setNodePickerVisible(false);
      return;
    }
    const id = ++nodeRequestId.current;
    const pickerId = ++nodePickerRequestId.current;
    const previousTarget = nodeTarget.current;
    nodeTarget.current = slug;
    setNodeError("");
    setNodePickerError("");
    if (userChange) invalidate();
    if (slug === "0") {
      setNodeReady(true);
      setNodePickerVisible(false);
      setNodePickerLoading(false);
      const changed = filtersRef.current.node !== "0" || previousTarget !== "0";
      filtersRef.current = { ...filtersRef.current, node: "0" };
      setFilters(filtersRef.current);
      if (userChange && changed && keywordRef.current.trim()) {
        void runSearch({ ...filtersRef.current, q: keywordRef.current, page: 1 }, true);
      }
      return;
    }
    setNodeReady(false);
    setNodePickerLoading(true);
    try {
      const options = await getSearchNodes();
      const selected = await resolveSearchNode(slug, options);
      if (!mounted.current || id !== nodeRequestId.current) return;
      const changed = filtersRef.current.node !== selected.value || previousTarget !== slug;
      setNodes(options);
      filtersRef.current = { ...filtersRef.current, node: selected.value };
      setFilters(filtersRef.current);
      setNodeReady(true);
      setNodePickerVisible(false);
      if (userChange && changed && keywordRef.current.trim()) {
        void runSearch({ ...filtersRef.current, q: keywordRef.current, page: 1 }, true);
      }
    } catch (err) {
      if (!mounted.current || id !== nodeRequestId.current) return;
      const message = err instanceof Error ? err.message : "板块筛选加载失败，请重试";
      setNodeError(message);
      if (pickerId === nodePickerRequestId.current) setNodePickerError(message);
    } finally {
      if (mounted.current && id === nodeRequestId.current && pickerId === nodePickerRequestId.current) setNodePickerLoading(false);
    }
  };

  const loadNodePicker = async () => {
    const id = ++nodePickerRequestId.current;
    setNodePickerLoading(true);
    if (!nodeError) setNodePickerError("");
    try {
      const [groups, options] = await Promise.all([fetchAndCacheNodeNavigation(), getSearchNodes()]);
      if (!mounted.current || id !== nodePickerRequestId.current) return;
      if (!groups.length) throw new Error("板块列表加载失败，请重试");
      setNodeGroups(groups);
      setNodes(options);
    } catch (err) {
      if (mounted.current && id === nodePickerRequestId.current) setNodePickerError(err instanceof Error ? err.message : "板块列表加载失败，请重试");
    } finally {
      if (mounted.current && id === nodePickerRequestId.current) setNodePickerLoading(false);
    }
  };

  const openNodePicker = () => {
    Taro.hideKeyboard();
    setNodePickerVisible(true);
    if (nodePickerLoading) return;
    if (nodeError) setNodePickerError(nodeError);
    if (!nodeGroups.length || !nodeError) void loadNodePicker();
  };

  const selectedNode = nodes.find((item) => item.value === filters.node);
  const selectedSlug = nodeReady
    ? nodeGroups.flatMap((group) => group.nodes).find((node) => node.name === selectedNode?.label)?.slug || filters.node || "0"
    : nodeTarget.current;
  const selectedNodeLabel = nodeReady ? selectedNode?.label || "节点筛选" : nodeTarget.current;


  const runSearch = async (params: SearchParams, ready = nodeReady) => {
    clearTimeout(autoSearchTimer.current);
    if (!ready) return;
    params = { ...params, q: params.q.trim() };
    if (!params.q) return;
    setHistory(current => rememberSearch(params.q, current));
    const id = ++requestId.current;
    invalidateOpening();
    submitted.current = params;
    setResponse(undefined);
    setLoading(true);
    setError("");
    if (!advanced) Taro.hideKeyboard();
    try {
      const data = await searchTopics(params);
      if (!mounted.current || id !== requestId.current) return;
      setResponse(data);
      if (data.nodes.length) setNodes(data.nodes);
      setResultScrollTop((current) => current === 0 ? 1 : 0);
    } catch (err) {
      if (mounted.current && id === requestId.current) {
        setError(err instanceof Error ? err.message : "网络连接失败，请检查网络后重试");
      }
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  };

  const submit = async (q = keyword) => {
    Taro.hideKeyboard();
    setAdvanced(false);
    clearTimeout(autoSearchTimer.current);
    if (q.trim()) { void runSearch({ ...filtersRef.current, q, page: 1 }); return; }
    const url = getPlaceholderTopicRoute(q, placeholderTopic);
    if (!url) { Taro.showToast({ icon: "none", title: "请输入搜索关键词" }); return; }
    if (openingRef.current) return;
    openingRef.current = true;
    const id = ++openingId.current;
    setOpening(placeholderTopic!.topicLink);
    Taro.hideKeyboard();
    try {
      await Taro.navigateTo({ url });
    } catch {
      if (mounted.current && id === openingId.current) Taro.showToast({ icon: "none", title: "打开失败，请重试" });
    } finally {
      if (mounted.current && id === openingId.current) {
        openingRef.current = false;
        setOpening("");
      }
    }
  };

  const openResult = async (result: SearchResult) => {
    if (openingRef.current) return;
    openingRef.current = true;
    const id = ++openingId.current;
    setOpening(result.link);
    try {
      const target = await resolveSearchResult(result);
      if (!mounted.current || id !== openingId.current) return;
      const params = Object.entries(target).map(([key, value]) =>
        `${key === "page" ? "p" : key}=${encodeURIComponent(value)}`).join("&");
      await Taro.navigateTo({ url: `/pages/topicDetail/index?${params}` });
    } catch (err) {
      if (mounted.current && id === openingId.current) Taro.showToast({
        icon: "none", title: err instanceof Error ? err.message : "打开失败，请重试",
      });
    } finally {
      if (mounted.current && id === openingId.current) {
        openingRef.current = false;
        setOpening("");
      }
    }
  };

  const advancedOverlay = (
    <BottomSheet visible={advanced} title='高级筛选' heightRpx={420} className='searchAdvancedSheet'
      onClose={() => { Taro.hideKeyboard(); setAdvanced(false); }}
      footer={<View className='searchAdvancedActions'>
        <Text className='searchFilterToggle' onClick={() => {
          nodeRequestId.current++;
          nodePickerRequestId.current++;
          nodeTarget.current = "0";
          setNodeReady(true);
          setNodeError("");
          setNodePickerError("");
          setNodePickerLoading(false);
          changeFilter(defaultFilters, 0, true);
        }}>重置筛选</Text>
        <Button className='searchSubmit' loading={loading} disabled={loading || !!opening || (!!keyword.trim() && !nodeReady)} onClick={() => submit()}>搜索</Button>
      </View>}>
        <View className='searchAdvanced'>
          <View className='searchField'>
            <Text className='searchFieldLabel'>主题作者</Text>
            <Input className='searchAuthor' placeholderClass='searchPlaceholder' placeholder='用户名' maxlength={80} value={filters.author} adjustPosition={false} confirmType='search'
              onInput={(e) => changeFilter({ author: e.detail.value }, 350)} onConfirm={() => submit()}
            />
          </View>
          {(["since", "until"] as const).map((key) => <View className='searchField' key={key}>
            <Text className='searchFieldLabel'>{key === "since" ? "开始日期" : "结束日期"}</Text>
            <Picker mode='date' start='1900-01-01' end='2100-12-31' value={filters[key] || ""}
              onChange={(e) => changeFilter({ [key]: e.detail.value })}
            >
              <Text className='searchFieldValue'>{filters[key] || "不限"} ▾</Text>
            </Picker>
            {filters[key] && <Text className='searchBarClear' onClick={() => changeFilter({ [key]: "" })}>清除</Text>}
          </View>)}
        </View>
    </BottomSheet>
  );

  return (
    <View className={`searchPage${skyline ? " searchPage--skyline" : ""}`}>
      <Navbar back title='搜索' titleStyle={{ opacity: 1 }} />
      <View className='searchBody'>
        <View className='searchBar'>
          <ThemedIcon src={SearchIcon} tone='secondary' lightColor='#000' className='searchBarIcon' />
          <Input
            className='searchBarInput'
            placeholder={placeholder}
            placeholderClass='searchPlaceholder'
            maxlength={120}
            confirmType='search'
            cursorColor='#0754ee'
            value={keyword}
            onInput={(e) => { invalidate(); setKeyword(e.detail.value); }}
            onConfirm={(e) => submit(e.detail.value)}
          />
          {keyword && <View className='searchClearButton' onClick={() => {
            invalidate(); setKeyword("");
          }}><View className='searchClearCircle'><View className='searchClearStroke searchClearStroke--first' /><View className='searchClearStroke searchClearStroke--second' /></View></View>}
          <Button className='searchSubmit' loading={loading} disabled={loading || !!opening || (!!keyword.trim() && !nodeReady)} onClick={() => submit()}>搜索</Button>
        </View>

        {!nodeReady && <View className='searchNodeStatus'>
          <Text>{nodeError || "正在加载当前板块筛选…"}</Text>
          {nodeError && <>
            <Text className='searchFilterToggle' onClick={() => selectSearchNode(nodeTarget.current)}>重试</Text>
            <Text className='searchFilterToggle' onClick={() => selectSearchNode("0")}>搜索全部板块</Text>
          </>}
        </View>}
        <View className='searchFilters'>
          <View className='searchNodeSelector' onClick={openNodePicker}>
            <Image src={NodesIcon} svg className='searchNodeIcon' />
            <Text className='searchNodeValue' {...(skyline ? { overflow: "ellipsis", maxLines: 1 } as const : {})}>{selectedNodeLabel}</Text>
            <View className='searchNodeArrow' />
          </View>
          <Picker className='searchFilterPicker searchFilterPicker--sort' mode='selector' range={sorts.map((item) => item.label)}
            value={sorts.findIndex((item) => item.value === filters.sort)}
            onChange={(e) => changeFilter({ sort: sorts[Number(e.detail.value)].value })}
          >
            <View className='searchFilter'>
              <ThemedIcon src={SortIcon} tone='secondary' lightColor='#596579' className='searchFilterIcon' />
              <Text className='searchFilterValue' {...(skyline ? { overflow: "ellipsis", maxLines: 1 } as const : {})}>{sorts.find((item) => item.value === filters.sort)?.label}</Text>
              <View className='searchFilterArrow' />
            </View>
          </Picker>
          <View className='searchAdvancedToggle' onClick={() => { Taro.hideKeyboard(); setAdvanced(true); }}>
            <ThemedIcon src={FilterIcon} tone='accent' lightColor='#0754ee' className='searchAdvancedIcon' />
            <Text>高级筛选</Text>
          </View>
        </View>

        {showHotTopics && history.length > 0 && <View className='searchHistory'>
          <View className='searchHistoryHeader'>
            <ThemedIcon src={HistoryIcon} tone='primary' lightColor='#10182d' className='searchHistoryIcon' />
            <Text className='searchHistoryTitle'>搜索历史</Text>
            <View className='searchHistoryClear' onClick={() => { clearSearchHistory(); setHistory([]); }}>
              <ThemedIcon src={TrashIcon} tone='secondary' lightColor='#28324a' className='searchHistoryClearIcon' /><Text>清空</Text>
            </View>
          </View>
          <View className='searchHistoryTags'>
            {history.map(query => <Text key={query} className='searchHistoryTag' onClick={() => {
              invalidate(); keywordRef.current = query; setKeyword(query); void submit(query);
            }}>{query}</Text>)}
          </View>
        </View>}
        {!showHotTopics && <View className='searchResultTabs'>
          {resultTabs.map(tab => <View key={tab.value} className={`searchResultTab${filters.scope === tab.value ? " searchResultTab--active" : ""}`}
            onClick={() => changeFilter({ scope: tab.value })}><Text>{tab.label}</Text></View>)}
        </View>}
        {response?.notice && <Text className='searchNotice'>{response.notice}</Text>}
        {showHotTopics ? <View className='searchResults searchResults--hot'><SearchHotTopics /></View> :
        <ScrollView type={getScrollViewType()} scrollY enhanced className='searchResultScroll' scrollTop={resultScrollTop}>
        <View className='searchResults'>
          {loading && <View className='searchEmpty'><Text className='searchEmptyText'>正在搜索网站内容…</Text></View>}
          {error && <View className='searchEmpty'>
            <Text className='searchEmptyText'>{error}</Text>
            <Button className='searchRetry' onClick={() => submitted.current && runSearch(submitted.current)}>重试</Button>
          </View>}
          {response?.results.length === 0 && <View className='searchEmpty'>
            <Text className='searchEmptyText'>未找到相关帖子</Text>
            <Text className='searchHint'>试试其他关键词，或放宽筛选条件</Text>
          </View>}
          {response?.results.map((result) => <View key={result.link} className='searchItem' onClick={() => openResult(result)}>
            <Text className='searchItemTitle'>{highlightedText(result.title, submitted.current?.q || keyword)}</Text>
            <View className='searchItemMeta'>
              <TopicTag label={result.category} />
              <Text className='searchMetaDot'>·</Text>
              <Text className='searchItemUser'>{result.displayName?.trim() || result.username}</Text>
              <Text className='searchMetaDot'>·</Text>
              <Text className='searchItemDate'>{result.publishedAt}</Text>
            </View>
            {result.excerpt && <Text className='searchExcerpt' {...(skyline ? { overflow: "ellipsis", maxLines: 3 } as const : {})}>{highlightedText(result.excerpt, submitted.current?.q || keyword)}</Text>}
          </View>)}
        </View>
        {response && (response.previousPage || response.nextPage) && <View className='searchPagination'>
          <Button className={`searchPageButton searchPageButton--previous${response.previousPage ? "" : " searchPageButton--disabled"}`} disabled={!response.previousPage}
            onClick={() => response.previousPage && submitted.current && runSearch({ ...submitted.current, page: response.previousPage })}>
            <View className='searchPageArrow searchPageArrow--previous' /><Text>上一页</Text>
          </Button>
          <Button className={`searchPageButton searchPageButton--next${response.nextPage ? "" : " searchPageButton--disabled"}`} disabled={!response.nextPage}
            onClick={() => response.nextPage && submitted.current && runSearch({ ...submitted.current, page: response.nextPage })}>
            <Text>下一页</Text><View className='searchPageArrow searchPageArrow--next' />
          </Button>
        </View>}
        </ScrollView>}
      </View>
      {advancedOverlay}
      <NodePicker
        visible={nodePickerVisible}
        groups={nodeGroups}
        selectedSlug={selectedSlug}
        allLabel='全部节点'
        loading={nodePickerLoading}
        error={nodePickerError}
        onRetry={nodeError ? () => selectSearchNode(nodeTarget.current) : loadNodePicker}
        onSelect={selectSearchNode}
        onClose={() => setNodePickerVisible(false)}
      />
    </View>
  );
}
