# Инструкция по сборке

## 1. Требования

- Node.js 20+ и `npm`
- Rust toolchain (рекомендуется версия не ниже `1.77.2`)
- Python 3 (нужен для скрипта обновления PDFium)
- Системные зависимости Tauri 2:
  - Windows: Microsoft Visual Studio C++ Build Tools
  - Linux/macOS: зависимости по официальной документации Tauri

## 2. Установка зависимостей

В корне проекта выполните:

```bash
npm ci
```

## 3. Подготовка PDFium

Если нужно обновить/перескачать бинарники PDFium:

```bash
npm run setup:pdfium
```

Для всех платформ:

```bash
npm run setup:pdfium -- --all
```

## 4. Локальная разработка


```bash
npm run app
```

## 5. Сборка

### 5.1 Web-сборка

```bash
npm run build
```

Результат: статический экспорт Next.js в каталог `out/`.

### 5.2 Desktop-сборка (Tauri)

```bash
npm run build:tauri
```

Результат: установщики/пакеты в `src-tauri/target/release/bundle/`.
