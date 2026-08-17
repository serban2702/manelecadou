import View from '@/app/m/[id]/view';
import { CadouShell } from './Shell';

export default function CadouSongView() {
  return (
    <CadouShell>
      <div className="cadou-wrap">
        <View />
      </div>
    </CadouShell>
  );
}
