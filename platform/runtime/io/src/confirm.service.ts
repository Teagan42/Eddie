import { Injectable } from "@nestjs/common";
import readline from "readline";

export interface ConfirmOptions {
  autoApprove?: boolean;
  nonInteractive?: boolean;
}

@Injectable()
export class ConfirmService {
  create(options: ConfirmOptions) {
    const autoApprove = options.autoApprove ?? false;
    const nonInteractive = options.nonInteractive ?? false;

    return async (message: string): Promise<boolean> => {
      if (autoApprove) {
        return true;
      }
      if (nonInteractive) {
        return false;
      }

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer: string = await new Promise((resolve) => {
        rl.question(`${message} [y/N] `, resolve);
      });

      rl.close();
      return /^y(es)?$/i.test(answer.trim());
    };
  }
}

