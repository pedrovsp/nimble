import { Route } from "../route/route";
import { MetaConfig } from "./decorators/classes/meta-config";
import { IScope } from "./interfaces/scope.interface";

export class Page implements IScope {
    public template: string;
    public title?: string;
    public meta?: MetaConfig;

    public route: Route;
    public isInitialized: boolean = false;
    public isDestroyed: boolean = false;

    public onNeedRerender: (page: Page) => void;

    onInit() {
    }

    onDestroy() {
    }

    public render(action: () => void) {
        if (this.onNeedRerender) {
            action();
            this.onNeedRerender(this);
        }
    }

    public eval(expression: string): any {
        try {
            return (new Function(`with(this) { return ${expression} }`)).call(this);
        }
        catch(e) {
            if (e.message.includes('is not defined')) {
                return '';
            }
            throw e;
        }
    }
}