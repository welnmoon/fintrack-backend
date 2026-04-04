import { Injectable } from '@nestjs/common';

@Injectable()
export class TwelvedataService {
  async fetchData() {
    const res = await fetch(
      `https://api.twelvedata.com/price?symbol=AAPL&apikey=${process.env.TWELVEDATA_SECRET_KEY}`,
      {
        method: 'GET',
      },
    );

    return res.json();
  }
}
