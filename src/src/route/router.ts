import { Route } from './route';
import { isNullOrUndefined } from 'util';
import { RouteBase } from './route-base';
import { NimbleApp, NimbleAppState } from '../app';
import { Page } from '../page/page';
import { RouterEvent } from './router-event.enum';
import { RouterEventType } from './router-event-type.enum';

export class Router {
    public static get app() { return NimbleApp.instance; }

    private static _routes: Route[] = [];
    private static _current: Route;
    private static _next: Route;
    private static _previous: Route;

    private static _state: RouterEvent;
    public static get state() { return this._state; };

    private static lastLocationPath: string;
    private static stopListening: boolean = false;

    private static listeners: { type: RouterEvent, callback: (route?: any) => void, internal: boolean }[] = [];

    public static useHash: boolean = false;

    public static _nextPath: string = null;

    private static nextRejectedAndRedirectAfter: boolean = false;

    public static get currentPath() { return (!isNullOrUndefined(this.nextPath) ? this.nextPath : (this.useHash ? location.hash : location.pathname)).replace(/^(\/#\/|#\/|\/#|\/|#)|(\/)$/g, ''); }
    public static get nextPath() { return this._nextPath; }

    public static get routes() { return this._routes; }
    public static get abstactRoutes() { return this._routes.filter(x => x.isAbstract); }
    public static get singleRoutes() { return this._routes.filter(x => !x.isAbstract); }
    public static get current() { return this._current; }
    public static get next() { return this._next; }
    public static get previous() { return this._previous; }

    public static get onRoute() { return !isNullOrUndefined(this._current); }


    public static registerRoutes(routes: RouteBase[]) {
        if (this.app.state === NimbleAppState.INITIALIZING) {
            this._routes = routes.map(routeBase => new Route(routeBase));
        }
    }

    private static setState(state: RouterEvent, senderNotify?: any, silentMode: boolean = false) {
        this._state = state;
        if (!silentMode) this.notifyListeners(state, senderNotify);
    }

    public static start() {
        if (this.app.state === NimbleAppState.INITIALIZING) {
            this.startListening();
        }
    }

    /**
     * Adds a listener for when the routing state changes.
     * Also it returns a void function to cancel listen when want. 
     * @param type 
     * @param callback 
     */
    public static addListener(type: RouterEvent, callback: () => void) {
        let listener = { type, callback, internal: this.app.state === NimbleAppState.INITIALIZING };
        this.listeners.push(listener);
        return () => this.listeners = this.listeners.filter(x => x !== listener);
    }

    private static startListening() {
        this.stopListening = false;
        setTimeout(() => this.listen(), 200);
    }

    private static notifyListeners(event: RouterEvent, sender?: any) {
        let listeners = this.listeners.filter(x => x.type === event);

        if (this.getEventType() === RouterEventType.START)
            listeners = listeners.sort((a,b) => {
                let internalA = a.internal;
                let internalB = b.internal;
                return (internalA === internalB)? 0 : (internalA ? -1 : 1);
            });
        else
            listeners = listeners.sort((a,b) => {
                let internalA = a.internal;
                let internalB = b.internal;
                return (internalA === internalB)? 0 : (internalA ? 1 : -1);
            });
        
        listeners.forEach((listener) => listener.callback(sender));
    }

    private static listen() {
        if (!this.stopListening) {
            if (!this.onRoute || this.currentPath !== this.lastLocationPath || (!isNullOrUndefined(this.nextPath) && !this.next)) {
                if (isNullOrUndefined(this.nextPath))
                    this.lastLocationPath = this.currentPath;

                let changed = false;
                if (this.checkPageCanBeCurrent()) {
                    changed = this.defineCurrentPage();
                }
                this.onRouterChange(changed);
            }
            setTimeout(this.listen.bind(this), 200);
        }
    }

    private static checkPageCanBeCurrent(): boolean {
        return this.routes.some((route, index) => {
            if (route.checkIfMatchCurrentLocation())
                return true;
            else if (index < ((this.routes.length - 1)) && !this.routes.slice(index + 1).some(x => x.path === route.path))
                return route.checkIfMatchCurrentLocation(true);
            return false;
        });
    }

    private static defineCurrentPage(): boolean {
        let newRoute = null;

        for (let route of this.singleRoutes) {
            newRoute = route.getMatchedPageWithLocation();
            if (newRoute)
                break;
        }

        if (!newRoute)
            for (let i = 0; i < this.abstactRoutes.length; i++) {
                let route = this.abstactRoutes[i];
                newRoute = route.getMatchedPageWithLocation();

                if (newRoute) break;
                else if(i < ((this.routes.length - 1)) && !this.routes.slice(i + 1).some(x => x.path === route.path)) {
                    newRoute = route.getMatchedPageWithLocation(true);
                    if (newRoute) break;
                }
            }

        if (newRoute !== this.current) {
            this._next = newRoute;
            return true;
        }

        return false;
    }

    private static onRouterChange(changedPage: boolean) {
        if (changedPage && this.next) {
            if (!this.next.isPriority || this.next.completePath() === this.currentPath) {
                this.loadCurrentRoutePage();
            }
            else {
                this.redirect(this.next.completePath());
                this._next = null;
            }
        }
        else if (!this.next) {
            console.error(`No pages matched with this path: "/${this.currentPath}". If it path is abstract (has childrens), set one child as 'isPriority: true' in "routes.ts".`);
            this._next = null;
            this.stopListening = true;
        }
    }

    private static loadCurrentRoutePage() {
        this.setState(RouterEvent.START_CHANGE, this.next);

        if (this.next.hasParent)
            this.loadRoutesPageFromAllParents();
        else
            this.loadRoutePage(this.next).then(
                () => {
                    this.defineCurrentAfterFinished();
                    this.setState(RouterEvent.FINISHED_CHANGE, this.current);
                },
                () => {
                    this.abortChangeRoute();
                    this.setState(RouterEvent.CHANGE_ERROR, this.current)
                },
            );
    }

    private static loadRoutesPageFromAllParents() {
        let commonParentRoute = this.previous ? Router.getCommonParentOfTwoRoutes(this.next, this.previous) : null;
        let parents = this.next.getAllParents().map((parentRoute) => ({
            route: parentRoute,
            makeNewInstance: true
        }));

        if (commonParentRoute) {
            for(let parent of parents.reverse()) {
                parent.makeNewInstance = false;
                if (parent.route === commonParentRoute)
                    break;
            }
        }

        let action = () => {
            if (parents.length > 0) {
                let parent = parents.pop();
                this.loadRoutePage(parent.route, parent.makeNewInstance).then(
                    () => {
                        action();
                    },
                    (error) => {
                        this.abortChangeRoute();
                        this.setState(RouterEvent.COMPLETED_LOADING);
                        this.setState(RouterEvent.ERROR_LOADING, error);
                    }
                );
            }
            else{
                this.loadRoutePage(this.next).then(
                    () => {
                        this.defineCurrentAfterFinished();
                        this.setState(RouterEvent.FINISHED_CHANGE, this.current);
                    },
                    () => {
                        this.abortChangeRoute();
                        this.setState(RouterEvent.CHANGE_ERROR, this.current)
                    },
                );
            }
        }

        action();
    }

    private static defineCurrentAfterFinished() {
        if (this._current)
            this._previous = this._current;
    
        if (this.next) {
            this._current = this.next;
            this._next = null;
        }

        if (!isNullOrUndefined(this._nextPath)) {
            let routePath = (this._nextPath.startsWith('/') ? '' : '/') + this._nextPath;
            if (this.useHash) 
                location.hash = routePath;
            else
                history.pushState(null, null, routePath);

            this._nextPath = null;
        }
        
        this.lastLocationPath = this.currentPath;

        if(!this.current) {
            debugger;
        }
        this.notifyOldRoutesElementExit();
    }

    private static abortChangeRoute() {
        if(!isNullOrUndefined(this.nextPath) && !this.nextRejectedAndRedirectAfter && this.current) {
            this._next = null;
            this._nextPath = null;
        }
    }

    private static loadRoutePage(route: Route, makeNewInstacePage: boolean = true, silentMode: boolean = false, notifyStart: boolean = true) {
        return new Promise<Route>((resolve, reject) => {
            this.setState(RouterEvent.STARTED_LOADING, route, silentMode || notifyStart);
            
            route.loadPage(
                (response: {page: Page, route: Route}) => {
                    if (this.routeCanActivate(route)) {
                        response.page.onEnter();
                        response.page.onNeedRerender = this.whenRerenderIsRequested.bind(this);
                        this.setState(RouterEvent.FINISHED_LOADING, route, silentMode);
                        resolve(route);
                    } {
                        this.setState(RouterEvent.REJECTED, route, silentMode);
                        reject(null);
                    }
                },
                (error) => {
                    this.setState(RouterEvent.ERROR_LOADING, error, silentMode);
                    reject(error);
                },
                () => {
                    this.setState(RouterEvent.COMPLETED_LOADING, null, silentMode);
                },
                makeNewInstacePage
            );
        });
    }

    private static routeCanActivate(route: Route) {
        let routePath = (this.currentPath.startsWith('/') ? '' : '/') + this.currentPath;
        if (route.routeActivate && route.routeActivate.length > 0) {
            for(let routeActivate of route.routeActivate) {
                let instance = NimbleApp.inject(routeActivate);
                if (instance && !instance.doActivate(routePath, route))
                    return false;
            }
        }
        return true;
    }

    public static redirect(route: string) {
        this.nextRejectedAndRedirectAfter = isNullOrUndefined(this.nextPath) ? false : true;
        this._nextPath = route;
    }

    private static notifyOldRoutesElementExit() {
        let highestParentRoute = this.current.getHighestParentOrHimself();
        let commonParentRoute = this.previous ? Router.getCommonParentOfTwoRoutes(this.current, this.previous) : highestParentRoute;
        
        if (this.previous) {
            let onlyOldRoutes: Route[] = [];

            for(let route of [this.previous, ...this.previous.getAllParents()]) {
                if (route === commonParentRoute)
                    break;
                onlyOldRoutes.push(route);
            }

            onlyOldRoutes.reverse().forEach((route) => {
                route.pageInstance.onExit();
            });
        }
    }

    private static whenRerenderIsRequested(page: Page) {
        let changingRouteInProgress = this.state === RouterEvent.START_CHANGE;
        let routeChangeFinished = this.state === RouterEvent.FINISHED_CHANGE;
        
        this.setState(RouterEvent.STARTED_RERENDER, page.route);

        let currentRoute = changingRouteInProgress ? this.previous : this.current;
        let routesToRerender = [currentRoute, ...currentRoute.getAllParents()];

        this.app.virtualizeSequenceRoutes(routesToRerender.reverse());

        
        if (!routeChangeFinished || this.state === RouterEvent.STARTED_RERENDER)
            this.setState(RouterEvent.FINISHED_RERENDER, page.route);

        if (changingRouteInProgress)
            this._state = RouterEvent.START_CHANGE;
    }

    public static getCommonParentOfTwoRoutes(routeA: Route, routeB: Route): Route {
        if (routeA && routeB) {
            let allRoutesA = [routeA, ...routeA.getAllParents()];
            let allRoutesB = [routeB, ...routeB.getAllParents()];

            let commonParent = allRoutesA.find(routeA => allRoutesB.some(routeB => routeA === routeB));
            return commonParent;
        }
        return null;
    }

    private static getEventType(state?: RouterEvent) {
        state = state ? state : this.state;
        switch(state) {
            case RouterEvent.START_CHANGE:
            case RouterEvent.STARTED_LOADING:
            case RouterEvent.STARTED_RERENDER:
                return RouterEventType.START

            case RouterEvent.FINISHED_CHANGE:
            case RouterEvent.FINISHED_LOADING:
            case RouterEvent.COMPLETED_LOADING:
            case RouterEvent.ERROR_LOADING:
            case RouterEvent.FINISHED_RERENDER:
            case RouterEvent.CHANGE_ERROR:
                return RouterEventType.END

            default:
                return RouterEventType.NONE
        }
    }
}