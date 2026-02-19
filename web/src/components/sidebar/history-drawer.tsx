import { Box, Button } from '@chakra-ui/react';
import { FiTrash2 } from 'react-icons/fi';
import { format, isToday, isYesterday, isThisYear } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DrawerRoot,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
  DrawerActionTrigger,
  DrawerBackdrop,
  DrawerCloseTrigger,
} from '@/components/ui/drawer';
import { sidebarStyles } from './sidebar-styles';
import { useHistoryDrawer } from '@/hooks/sidebar/use-history-drawer';
import { HistoryInfo } from '@/context/websocket-context';

// Type definitions
interface HistoryDrawerProps {
  children: React.ReactNode;
}

interface HistoryItemProps {
  isSelected: boolean;
  latestMessage: { content: string; timestamp: string | null };
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isDeleteDisabled: boolean;
}

function formatTimestamp(timestamp: string, lang: string): string {
  const date = new Date(timestamp);
  const locale = lang === 'zh' ? zhCN : enUS;

  if (isToday(date)) {
    return format(date, 'HH:mm', { locale });
  }
  if (isYesterday(date)) {
    return lang === 'zh'
      ? `昨天 ${format(date, 'HH:mm', { locale })}`
      : `Yesterday ${format(date, 'HH:mm', { locale })}`;
  }
  if (isThisYear(date)) {
    return lang === 'zh'
      ? format(date, 'M月d日 HH:mm', { locale })
      : format(date, 'MMM d, HH:mm', { locale });
  }
  return lang === 'zh'
    ? format(date, 'yyyy年M月d日', { locale })
    : format(date, 'MMM d, yyyy', { locale });
}

// Reusable components
const HistoryItem = memo(({
  isSelected,
  latestMessage,
  onSelect,
  onDelete,
  isDeleteDisabled,
}: HistoryItemProps): JSX.Element => {
  const { t, i18n } = useTranslation();
  return (
    <Box
      {...sidebarStyles.historyDrawer.historyItem}
      {...(isSelected ? sidebarStyles.historyDrawer.historyItemSelected : {})}
      onClick={onSelect}
      className="group"
    >
      <Box {...sidebarStyles.historyDrawer.historyHeader}>
        <Box {...sidebarStyles.historyDrawer.timestamp}>
          {latestMessage.timestamp
            ? formatTimestamp(latestMessage.timestamp, i18n.language)
            : t('history.noMessages')}
        </Box>
        {!isDeleteDisabled && (
          <Button
            onClick={onDelete}
            aria-label={t('ui.deleteChat')}
            title={t('ui.deleteChat')}
            {...sidebarStyles.historyDrawer.deleteButton}
          >
            <FiTrash2 />
          </Button>
        )}
      </Box>
      {latestMessage.content ? (
        <Box {...sidebarStyles.historyDrawer.messagePreview}>
          {latestMessage.content}
        </Box>
      ) : (
        <Box {...sidebarStyles.historyDrawer.messagePreview} color="whiteAlpha.400" fontStyle="italic">
          {t('history.noMessages')}
        </Box>
      )}
    </Box>
  );
});

HistoryItem.displayName = 'HistoryItem';

// Empty state component
const EmptyState = memo((): JSX.Element => {
  const { t } = useTranslation();
  return (
    <Box {...sidebarStyles.historyDrawer.emptyState}>
      <Box {...sidebarStyles.historyDrawer.emptyStateIcon}>
        💬
      </Box>
      <Box {...sidebarStyles.historyDrawer.emptyStateText}>
        {t('history.emptyState')}
      </Box>
      <Box {...sidebarStyles.historyDrawer.emptyStateHint}>
        {t('history.emptyStateHint')}
      </Box>
    </Box>
  );
});

EmptyState.displayName = 'EmptyState';

// Main component
function HistoryDrawer({ children }: HistoryDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const {
    open,
    setOpen,
    historyList,
    currentHistoryUid,
    fetchAndSetHistory,
    deleteHistory,
    getLatestMessageContent,
  } = useHistoryDrawer();

  return (
    <DrawerRoot
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      placement="start"
    >
      <DrawerBackdrop />
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent style={sidebarStyles.historyDrawer.drawer.content}>
        <DrawerHeader>
          <DrawerTitle style={sidebarStyles.historyDrawer.drawer.title}>
            {t('history.chatHistoryList')}
          </DrawerTitle>
          <DrawerCloseTrigger style={sidebarStyles.historyDrawer.drawer.closeButton} />
        </DrawerHeader>

        <DrawerBody>
          {historyList.length === 0 ? (
            <EmptyState />
          ) : (
            <Box {...sidebarStyles.historyDrawer.listContainer}>
              {historyList.map((history: HistoryInfo) => (
                <HistoryItem
                  key={history.uid}
                  isSelected={currentHistoryUid === history.uid}
                  latestMessage={getLatestMessageContent(history)}
                  onSelect={() => fetchAndSetHistory(history.uid)}
                  onDelete={(e) => {
                    e.stopPropagation();
                    deleteHistory(history.uid);
                  }}
                  isDeleteDisabled={currentHistoryUid === history.uid}
                />
              ))}
            </Box>
          )}
        </DrawerBody>

        <DrawerFooter>
          <DrawerActionTrigger asChild>
            <Button {...sidebarStyles.historyDrawer.drawer.actionButton}>
              {t('common.close')}
            </Button>
          </DrawerActionTrigger>
        </DrawerFooter>
      </DrawerContent>
    </DrawerRoot>
  );
}

export default HistoryDrawer;
