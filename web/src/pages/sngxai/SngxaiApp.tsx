import { BreathingBackground } from '../../components/shared/BreathingBackground';
import { Screen1 } from './Screen1';
import { getMockStats } from '../../data/mock-sngxai-stats';

const stats = getMockStats();

export function SngxaiApp() {
  return (
    <>
      <BreathingBackground />
      <Screen1 stats={stats} />
    </>
  );
}
