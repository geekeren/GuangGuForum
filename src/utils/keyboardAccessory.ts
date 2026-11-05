import Taro from '@tarojs/taro';

type OptionalKeyboardApi = { hideKeyboardAccessoryView?: () => void | Promise<void> };
declare const wx: OptionalKeyboardApi | undefined;
let diagnosticShown = false;

function diagnose(message: string) {
  if (process.env.NODE_ENV !== 'production' && !diagnosticShown) {
    diagnosticShown = true;
    console.debug('[keyboard accessory]', message);
  }
}

/** Attempts an optional host capability. A true result means invoked, not confirmed hidden. */
export function tryHideKeyboardAccessoryView(): boolean {
  try {
    const platform = Taro.getDeviceInfo?.().platform || Taro.getSystemInfoSync().platform;
    if (platform !== 'ios') return false;
    const native = typeof wx === 'undefined' ? undefined : wx;
    const taro = Taro as typeof Taro & OptionalKeyboardApi;
    const host = typeof native?.hideKeyboardAccessoryView === 'function' ? native : taro;
    if (typeof host.hideKeyboardAccessoryView !== 'function') {
      diagnose('This iOS host does not expose hideKeyboardAccessoryView.');
      return false;
    }
    const result = host.hideKeyboardAccessoryView();
    result?.catch(() => diagnose('The host rejected hideKeyboardAccessoryView.'));
    return true;
  } catch {
    diagnose('Unable to invoke hideKeyboardAccessoryView.');
    return false;
  }
}
