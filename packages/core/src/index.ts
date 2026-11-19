export {
  createFastLink,
  type FastLinkController,
  type FastLinkOptions,
} from './controller';
export { type FastLinkIntent } from './interaction';
export {
  createClickPreparation,
  type ClickPreparationController,
  type ClickPreparationOptions,
  type PreparedClick,
} from './preparation';
export {
  runFastNavigation,
  validateFastNavigationDecision,
  type FastRouterDecision,
  type FastDocumentDecision,
  type FastNavigationDecision,
} from './navigation';
