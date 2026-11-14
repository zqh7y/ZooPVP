import './style.css';
import { createApp } from './app';
import { fontReady } from './boot';

const canvas = document.getElementById('game') as HTMLCanvasElement;

fontReady().then(() => createApp(canvas));
