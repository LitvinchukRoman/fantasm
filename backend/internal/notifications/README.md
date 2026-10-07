# notifications

Вхідні сповіщення користувача. Інші контексти пишуть через `ports.Publisher` у власній транзакції: сповіщення існує тоді й лише тоді, коли відбулася дія, яку воно описує. Outbox і e-mail відсутні.

- Типи: `COMMENT`, `VOTE`, `JOIN`, `ACCEPTED`, `APPROVED`, `HIDDEN`, `EVENT_REMINDER`, `SYSTEM`. Payload — лише id та короткі рядки для показу, ніколи вміст, якого одержувач не бачив.
- `DedupeKey` не дає заповнити скриньку клікуванням «проголосувати/зняти».
- `GET /api/me/notifications` (курсор, `unread=true`), `POST /api/me/notifications/read` (`ids` до 100 або `all`), `GET /api/me/notifications/unread-count`. Курсор прив'язаний до користувача й фільтра. Чужі id просто нічого не змінюють.
- Задача `purge-notifications` видаляє прочитані старше 30 діб і будь-які старше 180.
