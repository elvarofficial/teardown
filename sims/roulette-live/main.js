import {bootWorker, isWorker} from '../roulette-shared/batch.js';
import {runLive} from '../roulette-shared/live.js';

// the same script runs the page and, in a Web Worker, the page's batch trials
if (isWorker()) bootWorker();
else runLive();
