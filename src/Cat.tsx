import { t } from './i18n';
import { CATS } from '../shared/domain';
import cloudImage from './assets/素材1.png';
import peachImage from './assets/素材2.png';
import matchaImage from './assets/素材3.png';
import butterImage from './assets/素材4.png';
import moonImage from './assets/素材5.png';

const CAT_IMAGES: Record<string, string> = {
  cloud: cloudImage,
  peach: peachImage,
  matcha: matchaImage,
  butter: butterImage,
  moon: moonImage,
};

export default function Cat({ id = 'cloud', sleeping = false, className = '' }: { id?: string; sleeping?: boolean; className?: string }) {
  const cat = CATS.find(c => c.id === id) ?? CATS[0];
  return <img
    className={'cat-art ' + className}
    src={CAT_IMAGES[cat.id] ?? cloudImage}
    alt={t('{0}猫猫', [t(cat.name)])}
    data-sleeping={sleeping ? 'true' : undefined}
  />;
}
