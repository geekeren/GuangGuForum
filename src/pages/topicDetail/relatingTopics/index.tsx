import { Image, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { TopicDetail, URLS } from "guanggu-forum-api";
import styles from './index.module.scss';
import LinkIcon from '../../../assets/link.svg';
import { base64Encode } from '../../../utils/routes';
import { urlPathVaiable } from "guanggu-forum-api";

interface Props {
    topicDetail: TopicDetail
}
const RelatingTopics = ({ topicDetail }: Props) => {
    return <View className={styles.content}>
        {topicDetail.relatingTopics.map((topic, index) => (
            <View
                key={index}
                className={styles.relatingTopicItem}
                onClick={async () => {
                    await Taro.navigateTo({
                        url: `/pages/topicDetail/index?tid=${
                            urlPathVaiable(URLS.TOPIC_DETAIL)(topic.link)?.params?.tid}`
                    })
                }}
            >
                <Image src={LinkIcon} className={styles.icon} />
                <View>
                    {topic.title}
                </View>
            </View>
        ))}
    </View>
};

export default RelatingTopics;
