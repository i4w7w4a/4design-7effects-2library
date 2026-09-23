import './style.css';
import '../effects/magnetic-cards/src/magneticCards.css';
import { DEFAULT_OPTIONS, mountMagneticCards } from '../effects/magnetic-cards/src/magneticCards';
import { mountCatalog } from './catalog';
import { createControls } from './controls';
import { type DemoOptions } from './options';

const effect = new URLSearchParams(window.location.search).get('effect');
if (!effect) {
  document.querySelector<HTMLElement>('#catalog')!.hidden = false;
  mountCatalog();
} else if (effect !== 'magnetic-cards') {
  const app = document.querySelector<HTMLElement>('#app')!;
  const unsupported = document.querySelector<HTMLElement>('#unsupported')!;
  app.hidden = true;
  unsupported.hidden = false;
  unsupported.innerHTML = '<p class="eyebrow">ЭФФЕКТ НЕ НАЙДЕН</p><h1>Такого примера здесь нет.</h1><p>Проверьте адрес или вернитесь к каталогу.</p><a href="/">Все эффекты <span aria-hidden="true">↗</span></a>';
} else {
  document.querySelector<HTMLElement>('#app')!.hidden = false;
  document.title = 'Магнитные карточки — 4i7 Design';
  const preview = document.querySelector<HTMLElement>('#preview-frame')!;
  const stage = document.querySelector<HTMLElement>('#magnetic-demo')!;
  let controller: ReturnType<typeof mountMagneticCards> | null = mountMagneticCards(stage, DEFAULT_OPTIONS);

  const controls = createControls(document.querySelector<HTMLElement>('#control-panel')!, {
    onChange: (options: DemoOptions) => controller?.updateOptions(options),
    onViewportChange: (viewport) => { preview.dataset.viewport = viewport; },
    async onSave(options: DemoOptions) {
      const response = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ effect: 'magnetic-cards', version: '0.1.0', options }),
      });
      const result = await response.json() as { error?: string; path?: string };
      if (!response.ok || !result.path) throw new Error(result.error ?? 'Сервер не сохранил настройки');
      return result.path;
    },
  });

  stage.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-magnetic-card]');
    if (card) document.querySelector<HTMLElement>('#card-feedback')!.textContent = `Выбрана карточка «${card.dataset.cardName}».`;
  });
  window.addEventListener('pagehide', () => {
    controller?.destroy();
    controller = null;
  });
  window.addEventListener('pageshow', () => {
    if (!controller) controller = mountMagneticCards(stage, controls.getOptions());
  });
}
