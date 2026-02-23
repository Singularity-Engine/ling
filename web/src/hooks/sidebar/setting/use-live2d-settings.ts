import { useState, useEffect } from 'react';
import { ModelInfo, useLive2DConfigRead, useLive2DConfigActions } from '@/context/live2d-config-context';

export const useLive2dSettings = () => {
  const { modelInfo: contextModelInfo } = useLive2DConfigRead();
  const { setModelInfo: contextSetModelInfo } = useLive2DConfigActions();

  const initialModelInfo: ModelInfo = {
    url: '',
    kScale: 0.5,
    initialXshift: 0,
    initialYshift: 0,
    emotionMap: {},
    scrollToResize: true,
  };

  const [modelInfo, setModelInfoState] = useState<ModelInfo>(
    contextModelInfo || initialModelInfo,
  );
  const [originalModelInfo, setOriginalModelInfo] = useState<ModelInfo>(
    contextModelInfo || initialModelInfo,
  );

  useEffect(() => {
    if (contextModelInfo) {
      if (JSON.stringify(contextModelInfo) !== JSON.stringify(originalModelInfo)) {
        setOriginalModelInfo(contextModelInfo);
        setModelInfoState(contextModelInfo);
      }
    }
  }, [contextModelInfo]);

  useEffect(() => {
    if (modelInfo) {
      contextSetModelInfo(modelInfo);
    }
  }, [modelInfo.pointerInteractive, modelInfo.scrollToResize]);

  const handleInputChange = (key: keyof ModelInfo, value: ModelInfo[keyof ModelInfo]): void => {
    setModelInfoState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (): void => {
    if (modelInfo) {
      setOriginalModelInfo(modelInfo);
    }
  };

  const handleCancel = (): void => {
    setModelInfoState(originalModelInfo);
    if (originalModelInfo) {
      contextSetModelInfo(originalModelInfo);
    }
  };

  return {
    modelInfo,
    handleInputChange,
    handleSave,
    handleCancel,
  };
};
