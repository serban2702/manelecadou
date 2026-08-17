import type { ExperienceModule } from '../types';
import HomePage from './HomePage';
import StudioPage from './StudioPage';
import SongView from './SongView';

export const classicExperience: ExperienceModule = {
  slug: 'classic',
  label: 'Classic',
  HomePage,
  StudioPage,
  SongView,
};
