# План архитектуры нового фронтенда

## Технологический стек

- **UI Framework**: Alpine.js 3.x
- **CSS Framework**: UnoCSS
- **Design System**: Собственная поверх UnoCSS
- **Роутинг**: Alpine Router или собственный простой роутер
- **State Management**: Alpine Stores
- **Bundler**: Без сборки (ESM модули)

## Структура файлов

```
public/
├── index.html              # SPA entry point
├── login.html              # Отдельная страница логина
├── css/
│   ├── uno.css            # Сгенерированный UnoCSS
│   └── design-system.css  # Компоненты дизайн системы
├── js/
│   ├── app.js            # Главный файл приложения
│   ├── router.js         # Простой роутер
│   ├── api.js            # API клиент
│   ├── stores/           # Глобальные хранилища
│   │   ├── auth.js       # Аутентификация и сессия
│   │   ├── account.js    # Информация об аккаунте
│   │   ├── models.js     # Список моделей
│   │   └── config.js     # Текущая конфигурация
│   ├── components/       # Alpine компоненты
│   │   ├── layout/
│   │   │   ├── header.js
│   │   │   ├── sidebar.js
│   │   │   └── footer.js
│   │   ├── auth/
│   │   │   ├── login-form.js
│   │   │   └── api-key-setup.js
│   │   ├── config/
│   │   │   ├── wizard.js
│   │   │   ├── editor.js
│   │   │   └── file-manager.js
│   │   ├── generate/
│   │   │   ├── model-selector.js
│   │   │   ├── parameters.js
│   │   │   └── progress.js
│   │   ├── results/
│   │   │   ├── viewer.js
│   │   │   └── exporter.js
│   │   └── admin/
│   │       └── users.js
│   ├── pages/           # Страницы приложения
│   │   ├── dashboard.js
│   │   ├── generate.js
│   │   ├── config.js
│   │   ├── results.js
│   │   ├── chat.js
│   │   └── admin.js
│   └── utils/           # Вспомогательные функции
│       ├── validators.js
│       ├── formatters.js
│       └── notifications.js
```

## Основные экраны (повторяют CLI flow)

### 1. Dashboard (главное меню CLI)
- 🚀 Generate data → `/generate`
- ⚙️ Create/edit configuration → `/config`
- 📊 View results → `/results`
- 💬 Chat with models → `/chat`
- 📂 Browse files → встроен в другие экраны
- 👥 Admin panel → `/admin` (только localhost)

### 2. Generate Flow (как в CLI)
1. Выбор конфигурации (список + drag&drop)
2. Выбор модели (с ценами)
3. Настройка параметров (count, temperature и т.д.)
4. Прогресс генерации (real-time)
5. Просмотр результатов

### 3. Configuration Flow
- Wizard для создания (пошаговый как в CLI)
- JSON редактор для продвинутых
- Управление файлами конфигураций
- Примеры конфигураций

### 4. Results Viewer
- Браузер выходных файлов
- JSON viewer с подсветкой
- Экспорт и скачивание
- История генераций

### 5. Chat Interface
- Выбор модели
- История сообщений
- Стоимость запросов
- Копирование результатов

### 6. Admin Panel (localhost)
- Управление пользователями
- Создание/удаление аккаунтов
- Сброс паролей
- Просмотр активности

## Дизайн система

### Базовые компоненты
```css
/* Кнопки */
.btn
.btn-primary
.btn-secondary
.btn-ghost
.btn-danger

/* Формы */
.form-input
.form-select
.form-textarea
.form-label
.form-help

/* Карточки */
.card
.card-header
.card-body
.card-footer

/* Алерты */
.alert
.alert-info
.alert-success
.alert-warning
.alert-error

/* Модальные окна */
.modal
.modal-backdrop
.modal-content
.modal-header
.modal-body
.modal-footer

/* Навигация */
.nav
.nav-item
.nav-link
.nav-active

/* Утилиты */
.stack-{1-6}    # Вертикальные отступы
.cluster-{1-6}  # Горизонтальные отступы
.grid-{2-4}     # Сетка
```

## Переиспользование кода из CLI

### Из lib/cli/:
- `modelSelector.js` → Логика выбора модели
- `configWizard.js` → Логика wizard'а
- `uiHelpers.js` → Форматирование (цены, размеры и т.д.)

### Из lib/utils/:
- `validation.js` → Валидация на клиенте
- `console.js` → Адаптировать для уведомлений
- `errors.js` → Обработка ошибок

### Из lib/:
- `validator.js` → Валидация JSON Schema
- `promptBuilder.js` → Построение промптов

## Особенности реализации

### Аутентификация
- Определение режима (localhost/cloud) при загрузке
- Автоматический редирект на login.html в cloud режиме
- Сохранение JWT токена в localStorage
- Обновление токена при истечении

### API клиент
```js
// js/api.js
class APIClient {
  constructor() {
    this.baseURL = '/api';
    this.token = localStorage.getItem('token');
  }
  
  async request(method, path, data) {
    // Автоматическое добавление токена
    // Обработка ошибок
    // Редирект на логин при 401
  }
}
```

### Управление состоянием
```js
// js/stores/auth.js
export const authStore = {
  user: null,
  token: null,
  isAdmin: false,
  isCloud: false,
  
  async login(email, password) { },
  async logout() { },
  async checkAuth() { }
}
```

### Роутинг
```js
// Простой hash-based роутер
window.router = {
  routes: {
    '/': 'dashboard',
    '/generate': 'generate',
    '/config': 'config',
    // ...
  },
  
  navigate(path) {
    window.location.hash = path;
  }
}
```

## Прогрессивная разработка

### Фаза 1: Базовая функциональность
1. Структура и дизайн система
2. Аутентификация и роутинг
3. Dashboard
4. Generate flow (минимальный)

### Фаза 2: Полный функционал
5. Configuration wizard и editor
6. Results viewer
7. Chat interface
8. Улучшение UX

### Фаза 3: Расширенные функции
9. Admin panel
10. Расширенные настройки
11. Экспорт/импорт
12. Оптимизация

## Вопросы для уточнения

1. Нужен ли drag&drop для файлов конфигураций?
2. Нужна ли поддержка темной темы?
3. Нужны ли горячие клавиши?
4. Нужна ли локализация интерфейса?