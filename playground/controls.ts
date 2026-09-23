import {
  DEEP_OPTIONS, DEFAULT_OPTIONS, OPTION_RANGES, QUIET_OPTIONS, type DemoOptions,
} from './options';

type NumericOption = Exclude<keyof DemoOptions, 'reducedMotion'>;

const FIELDS: Array<{ key: NumericOption; label: string; hint: string; unit: string; step: number }> = [
  { key: 'radius', label: 'Радиус отклика', hint: 'Насколько близко должен быть курсор', unit: ' px', step: 1 },
  { key: 'travel', label: 'Смещение', hint: 'Как далеко карточка тянется к курсору', unit: ' px', step: 1 },
  { key: 'responseMs', label: 'Скорость возврата', hint: 'Время мягкого возвращения', unit: ' мс', step: 1 },
  { key: 'tiltDeg', label: 'Наклон', hint: 'Поворот плоскости в сторону указателя', unit: '°', step: 1 },
  { key: 'depthPx', label: 'Глубина слоёв', hint: 'Расстояние между поверхностью и содержимым', unit: ' px', step: 1 },
  { key: 'perspectivePx', label: 'Перспектива', hint: 'Меньше число — заметнее объём', unit: ' px', step: 10 },
  { key: 'glow', label: 'Свет', hint: 'Яркость блика на поверхности', unit: '%', step: 0.01 },
];

function format(key: NumericOption, value: number) {
  if (key === 'glow') return `${Math.round(value * 100)}%`;
  return `${value}${FIELDS.find((field) => field.key === key)?.unit ?? ''}`;
}

function fieldMarkup({ key, label, hint, step }: (typeof FIELDS)[number]) {
  const [min, max] = OPTION_RANGES[key];
  return `<div class="control-field">
    <div class="control-field__head"><label for="control-${key}">${label}</label><output data-value="${key}" for="control-${key}"></output></div>
    <input id="control-${key}" name="${key}" type="range" min="${min}" max="${max}" step="${step}">
    <p class="control-field__hint">${hint}</p>
  </div>`;
}

export function createControls(
  root: HTMLElement,
  handlers: {
    onChange(options: DemoOptions): void;
    onSave(options: DemoOptions): Promise<string>;
    onViewportChange?(viewport: 'desktop' | 'phone'): void;
  },
) {
  let options = { ...DEFAULT_OPTIONS };
  let activePreset: 'quiet' | 'deep' | null = null;
  let viewport: 'desktop' | 'phone' = 'desktop';
  let revision = 0;

  root.innerHTML = `
    <div class="panel-heading">
      <div class="eyebrow">ПАРАМЕТРЫ ДВИЖЕНИЯ</div>
      <h2 id="controls-title">Настройка эффекта</h2>
      <p>Изменения сразу видны на карточках. Подведите курсор к любой из них.</p>
    </div>
    <section class="panel-section" aria-label="Готовые варианты">
      <div class="section-heading"><h3>Характер</h3><span>01 / 03</span></div>
      <div class="preset-row" role="group" aria-label="Готовые варианты">
        <button type="button" data-preset="quiet" aria-pressed="false"><span class="preset-icon preset-icon--quiet"></span><span>Спокойный</span><small>Лёгкий отклик</small></button>
        <button type="button" data-preset="deep" aria-pressed="false"><span class="preset-icon preset-icon--deep"></span><span>Глубокий</span><small>Явный объём</small></button>
      </div>
    </section>
    <section class="panel-section" aria-label="Точные настройки">
      <div class="section-heading"><h3>Точная настройка</h3><span>02 / 03</span></div>
      <div class="control-list">${FIELDS.map(fieldMarkup).join('')}</div>
    </section>
    <section class="panel-section panel-section--last" aria-label="Просмотр и доступность">
      <div class="section-heading"><h3>Проверка</h3><span>03 / 03</span></div>
      <div class="setting-line">
        <div><strong>Размер экрана</strong><span>Посмотреть карточки на телефоне</span></div>
        <div class="viewport-switch" role="group" aria-label="Размер предпросмотра">
          <button type="button" data-viewport="desktop" aria-label="Настольный экран" aria-pressed="true">▣</button>
          <button type="button" data-viewport="phone" aria-label="Телефон" aria-pressed="false">▯</button>
        </div>
      </div>
      <label class="setting-line setting-line--toggle" for="reduced-motion">
        <span><strong>Меньше движения</strong><span>Имитировать системный режим</span></span>
        <input id="reduced-motion" name="reducedMotion" type="checkbox" role="switch"><span class="toggle-track" aria-hidden="true"></span>
      </label>
    </section>
    <div class="panel-actions">
      <button type="button" class="button-reset" data-action="reset">Сбросить настройки</button>
      <button type="button" class="button-save" data-action="save"><span>Сохранить пресет</span><span aria-hidden="true">↗</span></button>
      <p class="save-status" data-save-status role="status" aria-live="polite"></p>
    </div>`;

  const sync = () => {
    for (const field of FIELDS) {
      const input = root.querySelector<HTMLInputElement>(`[name="${field.key}"]`)!;
      input.value = String(options[field.key]);
      const output = root.querySelector<HTMLOutputElement>(`[data-value="${field.key}"]`)!;
      output.value = format(field.key, options[field.key]);
      input.style.setProperty('--range-progress', `${100 * (options[field.key] - OPTION_RANGES[field.key][0]) / (OPTION_RANGES[field.key][1] - OPTION_RANGES[field.key][0])}%`);
    }
    root.querySelector<HTMLInputElement>('[name="reducedMotion"]')!.checked = options.reducedMotion;
    for (const preset of ['quiet', 'deep'] as const) {
      root.querySelector(`[data-preset="${preset}"]`)!.setAttribute('aria-pressed', String(activePreset === preset));
    }
  };
  const emit = () => {
    revision += 1;
    const status = root.querySelector<HTMLElement>('[data-save-status]')!;
    if (status.textContent) status.textContent = 'Настройки изменены. Сохраните пресет снова.';
    handlers.onChange({ ...options });
  };

  for (const field of FIELDS) {
    root.querySelector<HTMLInputElement>(`[name="${field.key}"]`)!.addEventListener('input', (event) => {
      options = { ...options, [field.key]: Number((event.currentTarget as HTMLInputElement).value) };
      activePreset = null;
      sync();
      emit();
    });
  }
  root.querySelector<HTMLInputElement>('[name="reducedMotion"]')!.addEventListener('change', (event) => {
    options = { ...options, reducedMotion: (event.currentTarget as HTMLInputElement).checked };
    emit();
  });
  for (const preset of ['quiet', 'deep'] as const) {
    root.querySelector<HTMLButtonElement>(`[data-preset="${preset}"]`)!.addEventListener('click', () => {
      options = { ...(preset === 'quiet' ? QUIET_OPTIONS : DEEP_OPTIONS), reducedMotion: options.reducedMotion };
      activePreset = preset;
      sync();
      emit();
    });
  }
  root.querySelector<HTMLButtonElement>('[data-action="reset"]')!.addEventListener('click', () => {
    options = { ...DEFAULT_OPTIONS };
    activePreset = null;
    sync();
    emit();
  });
  for (const value of ['desktop', 'phone'] as const) {
    root.querySelector<HTMLButtonElement>(`[data-viewport="${value}"]`)!.addEventListener('click', () => {
      viewport = value;
      for (const choice of ['desktop', 'phone'] as const) {
        root.querySelector(`[data-viewport="${choice}"]`)!.setAttribute('aria-pressed', String(choice === value));
      }
      handlers.onViewportChange?.(value);
    });
  }
  root.querySelector<HTMLButtonElement>('[data-action="save"]')!.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const status = root.querySelector<HTMLElement>('[data-save-status]')!;
    const savedRevision = revision;
    button.disabled = true;
    status.textContent = 'Сохраняю локально…';
    try {
      const localPath = await handlers.onSave({ ...options });
      status.textContent = revision === savedRevision
        ? `Сохранено: ${localPath}`
        : 'Настройки изменены. Сохраните пресет снова.';
    } catch (error) {
      status.textContent = revision === savedRevision
        ? `Не удалось сохранить: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`
        : 'Настройки изменены. Сохраните пресет снова.';
    } finally {
      button.disabled = false;
    }
  });
  sync();
  emit();
  return {
    getOptions: () => ({ ...options }),
    getViewport: () => viewport,
  };
}
