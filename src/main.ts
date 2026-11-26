import './style.css';
import { PlatformApp } from './platform/PlatformApp';
import { ControllerApp } from './controller/ControllerApp';

const params = new URLSearchParams(window.location.search);
const isController =
  params.get('mode') === 'controller' ||
  params.has('room') ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const root = document.getElementById('app')!;

if (isController) {
  const controller = new ControllerApp(root, params.get('room') || '');
  controller.mount();
} else {
  const platform = new PlatformApp(root);
  platform.mount();
}
