import { ENABLE_CUSTOM_NAVBAR } from '../config';

export default definePageConfig({
  navigationBarTitleText: '过早客',
  enableShareAppMessage: true,
  navigationStyle: ENABLE_CUSTOM_NAVBAR ? 'custom' : 'default',
  enablePullDownRefresh: true
})
