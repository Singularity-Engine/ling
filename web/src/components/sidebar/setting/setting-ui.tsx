/* eslint-disable import/no-extraneous-dependencies */
import {
  Tabs,
  Button,
  Spinner,
  DrawerRoot,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
  DrawerBackdrop,
  DrawerCloseTrigger,
} from '@chakra-ui/react';
import { lazy, Suspense, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseButton } from '@/components/ui/close-button';

import { settingStyles } from './setting-styles';

// Code-split tab panels — only loaded when their tab is first activated
const General = lazy(() => import('./general'));
const Live2D = lazy(() => import('./live2d'));
const ASR = lazy(() => import('./asr'));
const TTS = lazy(() => import('./tts'));
const Agent = lazy(() => import('./agent'));
const About = lazy(() => import('./about'));

const S_SPINNER: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '2rem 0',
};

interface SettingUIProps {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
}

function SettingUI({ open, onClose }: SettingUIProps): JSX.Element {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('general');

  // Track which tabs have been visited — their panels stay mounted to preserve form state
  const visitedTabs = useRef(new Set<string>(['general']));

  // Ref-based handler Sets — registration/unregistration is invisible to React
  // (no state updates, no re-renders, O(1) add/delete).  Handlers are read at
  // call-time inside handleSave/handleCancel, so they're always up-to-date.
  const saveHandlersRef = useRef(new Set<() => void>());
  const cancelHandlersRef = useRef(new Set<() => void>());

  const handleSaveCallback = useCallback((handler: () => void) => {
    saveHandlersRef.current.add(handler);
    return (): void => { saveHandlersRef.current.delete(handler); };
  }, []);

  const handleCancelCallback = useCallback((handler: () => void) => {
    cancelHandlersRef.current.add(handler);
    return (): void => { cancelHandlersRef.current.delete(handler); };
  }, []);

  // Ref mirrors onClose so the callbacks below stay perfectly stable — they
  // never recreate when the parent passes a new onClose reference.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleSave = useCallback((): void => {
    saveHandlersRef.current.forEach((handler) => handler());
    onCloseRef.current();
  }, []);

  const handleCancel = useCallback((): void => {
    cancelHandlersRef.current.forEach((handler) => handler());
    onCloseRef.current();
  }, []);

  const handleTabChange = useCallback((details: { value: string }) => {
    visitedTabs.current.add(details.value);
    setActiveTab(details.value);
  }, []);

  const fallback = (
    <div style={S_SPINNER}>
      <Spinner size="lg" color="blue.300" />
    </div>
  );

  return (
    <DrawerRoot
      open={open}
      onOpenChange={(e) => (e.open ? null : onClose())}
      placement="start"
    >
      <DrawerBackdrop />
      <DrawerContent {...settingStyles.settingUI.drawerContent}>
        <DrawerHeader {...settingStyles.settingUI.drawerHeader}>
          <DrawerTitle {...settingStyles.settingUI.drawerTitle}>
            {t('common.settings')}
          </DrawerTitle>
          <div {...settingStyles.settingUI.closeButton}>
            <DrawerCloseTrigger asChild onClick={handleCancel}>
              <CloseButton size="sm" color="white" />
            </DrawerCloseTrigger>
          </div>
        </DrawerHeader>

        <DrawerBody>
          <Tabs.Root
            defaultValue="general"
            value={activeTab}
            onValueChange={handleTabChange}
            {...settingStyles.settingUI.tabs.root}
          >
            <Tabs.List {...settingStyles.settingUI.tabs.list}>
              <Tabs.Trigger
                value="general"
                {...settingStyles.settingUI.tabs.trigger}
              >
                {t('settings.tabs.general')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="live2d"
                {...settingStyles.settingUI.tabs.trigger}
              >
                {t('settings.tabs.live2d')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="asr"
                {...settingStyles.settingUI.tabs.trigger}
              >
                {t('settings.tabs.asr')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="tts"
                {...settingStyles.settingUI.tabs.trigger}
              >
                {t('settings.tabs.tts')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="agent"
                {...settingStyles.settingUI.tabs.trigger}
              >
                {t('settings.tabs.agent')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="about"
                {...settingStyles.settingUI.tabs.trigger}
              >
                {t('settings.tabs.about')}
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.ContentGroup>
              <Tabs.Content value="general" {...settingStyles.settingUI.tabs.content}>
                <Suspense fallback={fallback}>
                  <General
                    onSave={handleSaveCallback}
                    onCancel={handleCancelCallback}
                  />
                </Suspense>
              </Tabs.Content>
              <Tabs.Content value="live2d" {...settingStyles.settingUI.tabs.content}>
                {visitedTabs.current.has('live2d') && (
                  <Suspense fallback={fallback}>
                    <Live2D
                      onSave={handleSaveCallback}
                      onCancel={handleCancelCallback}
                    />
                  </Suspense>
                )}
              </Tabs.Content>
              <Tabs.Content value="asr" {...settingStyles.settingUI.tabs.content}>
                {visitedTabs.current.has('asr') && (
                  <Suspense fallback={fallback}>
                    <ASR onSave={handleSaveCallback} onCancel={handleCancelCallback} />
                  </Suspense>
                )}
              </Tabs.Content>
              <Tabs.Content value="tts" {...settingStyles.settingUI.tabs.content}>
                {visitedTabs.current.has('tts') && (
                  <Suspense fallback={fallback}>
                    <TTS />
                  </Suspense>
                )}
              </Tabs.Content>
              <Tabs.Content value="agent" {...settingStyles.settingUI.tabs.content}>
                {visitedTabs.current.has('agent') && (
                  <Suspense fallback={fallback}>
                    <Agent
                      onSave={handleSaveCallback}
                      onCancel={handleCancelCallback}
                    />
                  </Suspense>
                )}
              </Tabs.Content>
              <Tabs.Content value="about" {...settingStyles.settingUI.tabs.content}>
                {visitedTabs.current.has('about') && (
                  <Suspense fallback={fallback}>
                    <About />
                  </Suspense>
                )}
              </Tabs.Content>
            </Tabs.ContentGroup>
          </Tabs.Root>
        </DrawerBody>

        <DrawerFooter>
          <Button colorPalette="red" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button colorPalette="blue" onClick={handleSave}>
            {t('common.save')}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </DrawerRoot>
  );
}

export default SettingUI;
