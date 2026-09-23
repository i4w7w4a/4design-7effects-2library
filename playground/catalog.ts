import catalogSource from '../catalog/index.jsonl?raw';

type CatalogEffect = {
  id: string;
  titleRu: string;
  summaryRu: string;
  status: 'draft' | 'ready' | 'deprecated';
  version: string;
  demo: string;
};

const statusLabels: Record<CatalogEffect['status'], string> = {
  draft: 'Черновик',
  ready: 'Готов',
  deprecated: 'Архив',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function effectCard(effect: CatalogEffect, index: number): HTMLElement {
  const card = element('article', 'catalog-card');
  card.setAttribute('aria-label', effect.titleRu);

  const art = element('a', `catalog-card__art catalog-card__art--${effect.id}`);
  art.href = effect.demo;
  art.setAttribute('aria-label', `Открыть демо: ${effect.titleRu}`);
  if (effect.id === 'magnetic-cards') {
    const artCards = element('div', 'catalog-card__art-cards');
    artCards.append(element('i', ''), element('i', ''), element('i', ''));
    art.append(artCards);
  } else {
    art.append(element('span', 'catalog-card__art-generic', '↗'));
  }
  art.append(element('span', 'catalog-card__art-label', `EFFECT / ${String(index + 1).padStart(2, '0')}`));

  const body = element('div', 'catalog-card__body');
  const meta = element('div', 'catalog-card__meta');
  meta.append(
    element('span', 'catalog-card__number', `№ ${String(index + 1).padStart(2, '0')}`),
    element('span', `catalog-card__status catalog-card__status--${effect.status}`, statusLabels[effect.status]),
  );
  const title = element('h2', 'catalog-card__title', effect.titleRu);
  const summary = element('p', 'catalog-card__summary', effect.summaryRu);
  const version = element('p', 'catalog-card__version', `Версия ${effect.version} · ${effect.id}`);
  const link = element('a', 'catalog-card__link', 'Смотреть эффект');
  link.href = effect.demo;
  link.append(element('span', 'catalog-card__link-icon', '↗'));
  link.lastElementChild?.setAttribute('aria-hidden', 'true');

  const details = element('details', 'catalog-card__apply');
  details.append(element('summary', '', 'Как применить'));
  const applyContent = element('div', 'catalog-card__apply-content');
  applyContent.append(element('p', '', 'Откройте нужный проект в Codex и вставьте запрос:'));
  applyContent.append(element('p', '', 'Если меняли настройки в демо, сначала нажмите «Сохранить пресет».'));
  const prompt = `$4i7-design Примени эффект ${effect.id} версии ${effect.version} к [укажите место в моём проекте]. Если я сохранил вариант в демо, используй последний сохранённый пресет этой версии; иначе возьми базовые настройки. Перед переносом назови выбранные параметры и проверь взаимодействие.`;
  applyContent.append(element('code', 'catalog-card__prompt', prompt));
  const copy = element('button', 'catalog-card__copy', 'Скопировать запрос');
  copy.type = 'button';
  const copyStatus = element('span', 'catalog-card__copy-status');
  copyStatus.setAttribute('role', 'status');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      copyStatus.textContent = 'Скопировано';
    } catch {
      copyStatus.textContent = 'Выделите текст запроса и скопируйте его вручную';
    }
  });
  applyContent.append(copy, copyStatus);
  details.append(applyContent);

  body.append(meta, title, summary, version, link, details);
  card.append(art, body);
  return card;
}

export function mountCatalog(): void {
  const entries = catalogSource.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as CatalogEffect);
  const list = document.querySelector<HTMLElement>('#catalog-list')!;
  list.replaceChildren(...entries.map(effectCard));
  document.querySelector<HTMLElement>('#catalog-count')!.textContent = `В коллекции: ${entries.length}`;
}
