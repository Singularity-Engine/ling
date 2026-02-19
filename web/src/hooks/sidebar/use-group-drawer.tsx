import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from '@/components/ui/toaster';

export const useGroupDrawer = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [inviteUid, setInviteUid] = useState('');

  const showUnsupported = useCallback(() => {
    toaster.create({
      title: '群组功能暂不可用',
      type: 'info',
      duration: 2000,
    });
  }, []);

  const requestGroupInfo = useCallback(() => {
    // Gateway doesn't support group functionality
  }, []);

  const handleInvite = useCallback(async () => {
    showUnsupported();
  }, [showUnsupported]);

  const handleRemove = useCallback((_targetUid: string) => {
    showUnsupported();
  }, [showUnsupported]);

  const handleLeaveGroup = useCallback((_selfUid: string) => {
    showUnsupported();
  }, [showUnsupported]);

  return {
    isOpen,
    setIsOpen,
    inviteUid,
    setInviteUid,
    handleInvite,
    handleRemove,
    handleLeaveGroup,
    requestGroupInfo,
  };
};
