import { Controller, Get, MessageEvent, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Public } from '../../common/decorators/public.decorator';
import { ForexService } from './forex.service';
import { ForexStreamQueryDto } from './dto/forex-stream-query.dto';

@Controller('forex')
export class ForexController {
  constructor(private readonly forexService: ForexService) {}

  @Get('snapshot')
  @Public()
  getSnapshot(@Query() query: ForexStreamQueryDto) {
    return this.forexService.getSnapshot(query.symbol, query.interval);
  }

  @Sse('stream')
  @Public()
  stream(@Query() query: ForexStreamQueryDto): Observable<MessageEvent> {
    return this.forexService.stream(query.symbol, query.interval);
  }
}
