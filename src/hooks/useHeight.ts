import Taro, { useReady } from '@tarojs/taro';
import { useState } from 'react';

export const useHeight = (id: string) => {
  const [height, setHeight] = useState(0);
  console.log('id', id);
  useReady(() => {
    Taro.nextTick(() => {
      const query = Taro.createSelectorQuery();
      query.select(`#${id}`)
        .boundingClientRect((res) => {
          res?.height && setHeight(res.height);
          console.log('height', `#${id}`, res, id);
        }).exec()
    })
  })

  return height;
}
