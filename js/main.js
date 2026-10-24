import AppController from './AppController.js';
import AnalysisController from './analysis/AnalysisController.js';
import BatchController from './BatchController.js';
import TextFeatureController from './text/TextFeatureController.js';

const app = new AppController();
new AnalysisController(document, app.pages);
new BatchController(document, app);
new TextFeatureController(document, app);
