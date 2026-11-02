import { Text } from '@tarojs/components';
import { AI_USER_LABEL, isAiUser } from '../../utils/aiUser';
import './index.scss';

export default function AiUserTag({ username, compact = false, className = '' }: { username?: string; compact?: boolean; className?: string }) {
  if (!isAiUser(username)) return null;
  return <Text className={`aiUserTag${compact ? ' aiUserTag--compact' : ''} ${className}`}>{compact ? 'AI' : AI_USER_LABEL}</Text>;
}
