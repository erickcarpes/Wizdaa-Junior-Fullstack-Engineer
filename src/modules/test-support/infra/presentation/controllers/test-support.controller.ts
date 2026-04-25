import { Controller, Post } from '@nestjs/common';
import { TestSupportService } from '@/modules/test-support/test-support.service';

@Controller('test-support')
export class TestSupportController {
  constructor(private readonly testSupportService: TestSupportService) {}

  @Post('reset')
  reset() {
    return this.testSupportService.reset();
  }
}
