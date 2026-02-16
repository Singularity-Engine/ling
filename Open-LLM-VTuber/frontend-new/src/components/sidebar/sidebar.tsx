/* eslint-disable react/require-default-props */
import { Box, Button, Menu } from '@chakra-ui/react';
import {
  FiSettings, FiClock, FiPlus, FiChevronLeft, FiUsers, FiLayers
} from 'react-icons/fi';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { sidebarStyles } from './sidebar-styles';
import SettingUI from './setting/setting-ui';
import ChatHistoryPanel from './chat-history-panel';
import BottomTab from './bottom-tab';
import HistoryDrawer from './history-drawer';
import { useSidebar } from '@/hooks/sidebar/use-sidebar';
import GroupDrawer from './group-drawer';
import { ModeType } from '@/context/mode-context';

// Type definitions
interface SidebarProps {
  isCollapsed?: boolean
  onToggle: () => void
}

interface HeaderButtonsProps {
  onSettingsOpen: () => void
  onNewHistory: () => void
  setMode: (mode: ModeType) => void
  currentMode: 'window' | 'pet'
  isElectron: boolean
}

// Reusable components
const ToggleButton = memo(({ isCollapsed, onToggle }: {
  isCollapsed: boolean
  onToggle: () => void
}) => {
  const { t } = useTranslation();
  return (
  <Box
    {...sidebarStyles.sidebar.toggleButton}
    role="button"
    tabIndex={0}
    aria-label={isCollapsed ? t('ui.expandSidebar') : t('ui.collapseSidebar')}
    aria-expanded={!isCollapsed}
    title={isCollapsed ? t('ui.expandSidebar') : t('ui.collapseSidebar')}
    style={{
      transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
    }}
    onClick={onToggle}
    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
  >
    <FiChevronLeft />
  </Box>
  );
});

ToggleButton.displayName = 'ToggleButton';

const ModeMenu = memo(({ setMode, currentMode, isElectron }: {
  setMode: (mode: ModeType) => void
  currentMode: ModeType
  isElectron: boolean
}) => (
  <Menu.Root>
    <Menu.Trigger as={Button} aria-label="Mode Menu" title="Change Mode">
      <FiLayers />
    </Menu.Trigger>
    <Menu.Positioner>
      <Menu.Content>
        <Menu.RadioItemGroup value={currentMode}>
          <Menu.RadioItem value="window" onClick={() => setMode('window')}>
            <Menu.ItemIndicator />
            Live Mode
          </Menu.RadioItem>
          <Menu.RadioItem 
            value="pet" 
            onClick={() => {
              if (isElectron) {
                setMode('pet');
              }
            }}
            disabled={!isElectron}
            title={!isElectron ? "Pet mode is only available in desktop app" : undefined}
          >
            <Menu.ItemIndicator />
            Pet Mode
          </Menu.RadioItem>
        </Menu.RadioItemGroup>
      </Menu.Content>
    </Menu.Positioner>
  </Menu.Root>
));

ModeMenu.displayName = 'ModeMenu';

const HeaderButtons = memo(({ onSettingsOpen, onNewHistory, setMode, currentMode, isElectron }: HeaderButtonsProps) => {
  const { t } = useTranslation();
  return (
  <Box display="flex" gap={1}>
    <Button onClick={onSettingsOpen} aria-label={t('ui.openSettings')} title={t('ui.settings')}>
      <FiSettings />
    </Button>

    <GroupDrawer>
      <Button aria-label={t('ui.group')} title={t('ui.group')}>
        <FiUsers />
      </Button>
    </GroupDrawer>

    <HistoryDrawer>
      <Button aria-label={t('ui.chatHistory')} title={t('ui.chatHistory')}>
        <FiClock />
      </Button>
    </HistoryDrawer>

    <Button onClick={onNewHistory} aria-label={t('ui.newChat')} title={t('ui.newChat')}>
      <FiPlus />
    </Button>

    <ModeMenu setMode={setMode} currentMode={currentMode} isElectron={isElectron} />
  </Box>
  );
});

HeaderButtons.displayName = 'HeaderButtons';

const SidebarContent = memo(({ 
  onSettingsOpen, 
  onNewHistory, 
  setMode, 
  currentMode,
  isElectron
}: HeaderButtonsProps) => (
  <Box {...sidebarStyles.sidebar.content}>
    <Box {...sidebarStyles.sidebar.header}>
      <HeaderButtons
        onSettingsOpen={onSettingsOpen}
        onNewHistory={onNewHistory}
        setMode={setMode}
        currentMode={currentMode}
        isElectron={isElectron}
      />
    </Box>
    <ChatHistoryPanel />
    <BottomTab />
  </Box>
));

SidebarContent.displayName = 'SidebarContent';

// Main component
function Sidebar({ isCollapsed = false, onToggle }: SidebarProps): JSX.Element {
  const {
    settingsOpen,
    onSettingsOpen,
    onSettingsClose,
    createNewHistory,
    setMode,
    currentMode,
    isElectron,
  } = useSidebar();

  return (
    <Box {...sidebarStyles.sidebar.container(isCollapsed)}>
      <ToggleButton isCollapsed={isCollapsed} onToggle={onToggle} />

      {!isCollapsed && !settingsOpen && (
        <SidebarContent
          onSettingsOpen={onSettingsOpen}
          onNewHistory={createNewHistory}
          setMode={setMode}
          currentMode={currentMode}
          isElectron={isElectron}
        />
      )}

      {!isCollapsed && settingsOpen && (
        <SettingUI
          open={settingsOpen}
          onClose={onSettingsClose}
          onToggle={onToggle}
        />
      )}
    </Box>
  );
}

export default Sidebar;
