import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import SearchIcon from "../../assets/search.svg";
import { useSearchPlaceholder } from "../../hooks/useSearchPlaceholder";
import { buildSearchRoute } from "../../utils/searchRoute";
import "./index.scss";

interface SearchEntryProps {
  className?: string;
  style?: React.CSSProperties;
  node?: string;
  nodeName?: string;
}

export default function SearchEntry({ className = "", style, node, nodeName }: SearchEntryProps) {
  const { placeholder } = useSearchPlaceholder(!node);
  const label = node ? `搜索${nodeName || "当前板块"}的内容` : placeholder;
  const url = buildSearchRoute(node, nodeName);
  return (
    <View className={`searchEntry ${className}`} style={style}
      onClick={() => Taro.navigateTo({ url })}
    >
      <Image src={SearchIcon} svg className='searchIcon' />
      <Text className='searchText' overflow='ellipsis' maxLines={1}>{label}</Text>
    </View>
  );
}
