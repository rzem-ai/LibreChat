import { Separator } from '@librechat/client';
import { DeloitteLogo } from './Deloittelogo';

interface LockupProps {
  title: string;
}

const Lockup = ({ title }: LockupProps) => {
  return (
    <div className="flex items-center gap-2">
      <DeloitteLogo className="h-5 w-auto text-foreground" />
      <Separator orientation="vertical" className="h-5" />
      <span className="text-xl font-extralight text-foreground">{title}</span>
    </div>
  );
};

export { Lockup };
