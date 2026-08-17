import type { ExperienceModule } from '../types';
import HomePage from './HomePage';
import StudioPage from './WizardPage';
import SongView from './SongView';

export const cadouExperience: ExperienceModule = {
  slug: 'cadou',
  label: 'Cadou',
  HomePage,
  StudioPage,
  SongView,
};
