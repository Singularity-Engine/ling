/**
 * Providers — Extracted from App.tsx to reduce nesting depth.
 *
 * Wraps all non-auth context providers in a clean pipeline.
 * Auth-related providers (AuthProvider, BrowserRouter) stay in App.tsx
 * since they're needed before routing.
 */

import type { ReactNode } from "react";
import { UIProvider } from "@/context/UiContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ModeProvider } from "@/context/ModeContext";
import { CameraProvider } from "@/context/CameraContext";
import { ScreenCaptureProvider } from "@/context/ScreenCaptureContext";
import { CharacterConfigProvider } from "@/context/CharacterConfigContext";
import { ChatHistoryProvider } from "@/context/ChatHistoryContext";
import { AiStateProvider } from "@/context/AiStateContext";
import { ProactiveSpeakProvider } from "@/context/ProactiveSpeakContext";
import { Live2DConfigProvider } from "@/context/Live2dConfigContext";
import { SubtitleProvider } from "@/context/SubtitleContext";
import { VADProvider } from "@/context/VadContext";
import { BgUrlProvider } from "@/context/BgurlContext";
import { GroupProvider } from "@/context/GroupContext";
import { BrowserProvider } from "@/context/BrowserContext";
import { ToolStateProvider } from "@/context/ToolStateContext";
import { TTSStateProvider } from "@/context/TtsStateContext";
import { AffinityProvider } from "@/context/AffinityContext";
import WebSocketHandler from "@/services/websocket-handler";

/**
 * Compose providers in dependency order.
 * Listed explicitly (not array-reduced) for TypeScript inference and readability.
 */
export function Providers({ children }: { children: ReactNode }): JSX.Element {
  return (
    <UIProvider>
    <ThemeProvider>
    <ModeProvider>
      <CameraProvider>
        <ScreenCaptureProvider>
          <CharacterConfigProvider>
            <ChatHistoryProvider>
              <AiStateProvider>
                <ProactiveSpeakProvider>
                  <Live2DConfigProvider>
                    <SubtitleProvider>
                      <VADProvider>
                        <BgUrlProvider>
                          <GroupProvider>
                            <BrowserProvider>
                              <ToolStateProvider>
                                <TTSStateProvider>
                                <AffinityProvider>
                                  <WebSocketHandler>
                                    {children}
                                  </WebSocketHandler>
                                </AffinityProvider>
                                </TTSStateProvider>
                              </ToolStateProvider>
                            </BrowserProvider>
                          </GroupProvider>
                        </BgUrlProvider>
                      </VADProvider>
                    </SubtitleProvider>
                  </Live2DConfigProvider>
                </ProactiveSpeakProvider>
              </AiStateProvider>
            </ChatHistoryProvider>
          </CharacterConfigProvider>
        </ScreenCaptureProvider>
      </CameraProvider>
    </ModeProvider>
    </ThemeProvider>
    </UIProvider>
  );
}
