/**
 * Providers — Extracted from App.tsx to reduce nesting depth.
 *
 * Wraps all non-auth context providers in a clean pipeline.
 * Auth-related providers (AuthProvider, BrowserRouter) stay in App.tsx
 * since they're needed before routing.
 */

import type { ReactNode } from "react";
import { UIProvider } from "@/context/ui-context";
import { ThemeProvider } from "@/context/theme-context";
import { ModeProvider } from "@/context/mode-context";
import { CameraProvider } from "@/context/camera-context";
import { ScreenCaptureProvider } from "@/context/screen-capture-context";
import { CharacterConfigProvider } from "@/context/character-config-context";
import { ChatHistoryProvider } from "@/context/chat-history-context";
import { AiStateProvider } from "@/context/ai-state-context";
import { ProactiveSpeakProvider } from "@/context/proactive-speak-context";
import { Live2DConfigProvider } from "@/context/live2d-config-context";
import { SubtitleProvider } from "@/context/subtitle-context";
import { VADProvider } from "@/context/vad-context";
import { BgUrlProvider } from "@/context/bgurl-context";
import { GroupProvider } from "@/context/group-context";
import { BrowserProvider } from "@/context/browser-context";
import { ToolStateProvider } from "@/context/tool-state-context";
import { TTSStateProvider } from "@/context/tts-state-context";
import { AffinityProvider } from "@/context/affinity-context";
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
