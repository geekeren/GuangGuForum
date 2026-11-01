import { View, Text, Image } from "@tarojs/components";
import HotIcon from "../../assets/hot-flame.svg";
import "./index.scss";

export default function HotTopicRank({ rank, padded = true }: { rank: number; padded?: boolean }) {
  return (
    <View className={`hotRank hotRank--${Math.min(rank, 4)}`}>
      {rank <= 3 && <Image src={HotIcon} svg className='hotRankFlame' />}
      <Text>{padded ? String(rank).padStart(2, "0") : String(rank)}</Text>
    </View>
  );
}
