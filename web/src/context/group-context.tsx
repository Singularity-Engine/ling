import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface GroupContextState {
  selfUid: string;
  groupMembers: string[];
  isOwner: boolean;
  setSelfUid: (uid: string) => void;
  setGroupMembers: (members: string[]) => void;
  setIsOwner: (isOwner: boolean) => void;
  sortedGroupMembers: string[];
  resetGroupState: () => void;
}

const GroupContext = createContext<GroupContextState | null>(null);

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const [selfUid, setSelfUid] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false);

  const resetGroupState = useCallback(() => {
    setGroupMembers([]);
    setIsOwner(false);
  }, []);

  const sortedGroupMembers = useMemo(() => {
    if (!groupMembers.includes(selfUid)) return groupMembers;

    return [
      selfUid,
      ...groupMembers.filter((memberId) => memberId !== selfUid),
    ];
  }, [groupMembers, selfUid]);

  const contextValue = useMemo(
    () => ({ selfUid, groupMembers, isOwner, setSelfUid, setGroupMembers, setIsOwner, sortedGroupMembers, resetGroupState }),
    [selfUid, groupMembers, isOwner, sortedGroupMembers, resetGroupState],
  );

  return (
    <GroupContext.Provider value={contextValue}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup() {
  const context = useContext(GroupContext);
  if (!context) {
    throw new Error('useGroup must be used within a GroupProvider');
  }
  return context;
}
