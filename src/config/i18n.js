'use strict';

const path = require('path');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');

async function setupI18n() {
  await i18next
    .use(Backend)
    .use(middleware.LanguageDetector)
    .init({
      fallbackLng: 'en',
      supportedLngs: ['en', 'fr'],
      preload: ['en', 'fr'],
      ns: ['translation'],
      defaultNS: 'translation',
      backend: {
        loadPath: path.join(__dirname, '../../locales/{{lng}}/{{ns}}.json'),
      },
      detection: {
        order: ['session', 'querystring', 'cookie', 'header'],
        lookupSession: 'locale',
        lookupQuerystring: 'lang',
        caches: ['session'],
      },
      interpolation: { escapeValue: false },
    });

  return i18next;
}

module.exports = { setupI18n, i18next };
