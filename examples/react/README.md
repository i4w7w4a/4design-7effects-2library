# React-адаптер магнитных карточек

`MagneticCards` подключает DOM-модуль после монтажа, обновляет настройки без пересоздания карточек и вызывает `destroy()` при размонтировании. Работает с React StrictMode. Ссылка или кнопка остаётся внешним `[data-magnetic-card]`; движется внутренний `[data-magnetic-visual]`.

```tsx
import { MagneticCards } from './MagneticCards';
import './magnetic-cards.css';

<MagneticCards options={{ depthPx: 36, tiltDeg: 13 }}>
  <a className="magnetic-react-card" data-magnetic-card href="/contact">
    <span className="magnetic-react-visual" data-magnetic-visual>
      <span className="magnetic-react-depth">Связаться</span>
    </span>
  </a>
</MagneticCards>
```

Пути импортов в целевом проекте настрой под его структуру. Разметка карточек должна оставаться стабильной после монтажа: ядро считывает список `[data-magnetic-card]` при `mount`. Если список ссылок меняется, размонтируй и заново смонтируй обвязку через React `key`. Настройки принимают ключи из `controls.schema.json`; системный reduced motion имеет приоритет.
