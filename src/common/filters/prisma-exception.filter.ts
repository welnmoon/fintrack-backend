import { ArgumentsHost, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    // что за host и ArgumentsHost - это типы из NestJS, которые используются для обработки исключений. ArgumentsHost предоставляет доступ к аргументам, переданным в момент возникновения исключения, и позволяет нам получить контекст выполнения (например, HTTP-запрос, WebSocket-соединение и т.д.). В данном случае мы используем его для получения доступа к HTTP-контексту, чтобы отправить правильный ответ клиенту.

    const ctx = host.switchToHttp(); // Получаем HTTP-контекст из ArgumentsHost. Это позволяет нам работать с объектами запроса и ответа, которые используются в HTTP-обработчиках NestJS.
    const res = ctx.getResponse(); // Получаем объект ответа из HTTP-контекста. Этот объект используется для отправки ответа клиенту.

    let status = HttpStatus.BAD_REQUEST; // Устанавливаем статус ответа по умолчанию на 400 (Bad Request). Это означает, что если не будет найдено более специфическое соответствие для типа ошибки, мы будем возвращать этот статус.
    let message = 'Database error'; // Устанавливаем сообщение по умолчанию для ответа. Это сообщение будет отправлено клиенту, если не будет найдено более специфическое соответствие для типа ошибки.

    switch (exception.code) {
      case 'P2002': // Этот код ошибки означает, что произошло нарушение уникального ограничения в базе данных (например, попытка создать запись с уже существующим уникальным полем).
        status = HttpStatus.CONFLICT;
        message = 'Unique constraint failed';
        break;
      case 'P2025': // Этот код ошибки означает, что произошла ошибка при выполнении операции обновления или удаления, и не было найдено соответствующей записи (например, попытка обновить запись, которая не существует).
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found';
        break;
      case 'P2003': // Этот код ошибки означает, что произошло нарушение внешнего ключа в базе данных (например, попытка создать запись, которая ссылается на несуществующую запись в другой таблице).
        status = HttpStatus.BAD_REQUEST;
        message = 'Foreign key constraint failed';
        break;
    }
    res.status(status).json({
      statusCode: status,
      message,
      prismaCode: exception.code,
    });
  }
}
