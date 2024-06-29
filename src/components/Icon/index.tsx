import { View, Image } from "@tarojs/components";
import styles from "./index.module.scss";

interface Props {
  name: string;
  size: number;
}

const Tag = ({ name, size }: Props) => {
  const icon = require(`../../assets/${name}`);
  return (
    <View className={styles.container}>
      <Image
        className={styles.image}
        style={{ height: size, width: size }}
        src={icon}
      />
    </View>
  );
};
export default Tag;
