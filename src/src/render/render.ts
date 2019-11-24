import { Route } from "./../route/route";
import { Router } from "./../route/router";
import { HeaderRender } from "./header-render";
import { DirectivesRender } from "./directives-render";
import { Injectable } from "../inject/injectable";
import { NimbleApp } from "./../app";

const { DiffDOM } = require('diff-dom');

@Injectable()
export class Render {
    private get app() { return NimbleApp.instance; }

    private diffDOM: any;

    constructor(
        private headerRender: HeaderRender,
        private directivesRender: DirectivesRender
    ) {
        this.diffDOM = new DiffDOM();
    }

    public virtualizeRoute(route: Route) {
        if (route.parent)
            this.virtualizeRouteInParent(route);
        else
            this.virtualizeRouteInRootElement(route);
    }

    private virtualizeRouteInParent(route: Route) {
        let parent = route.parent;
        route.element.virtual = this.createPageElementAndResolve(route.pageInstance.template, route.pageInstance);

        let virtualParentRouterElement = parent.element.virtual.querySelector('nimble-router');

        if (virtualParentRouterElement) {
            this.removeAllChildren(virtualParentRouterElement);
            virtualParentRouterElement.appendChild(route.element.virtual);
        }
        else {
            console.error(`The path "/${route.completePath()}" cannot be rendered, because the parent route need of "nimble-router" element in your template.`);
        }
    }

    private virtualizeRouteInRootElement(route: Route) {
        route.element.virtual = this.createPageElementAndResolve(route.pageInstance.template, route.pageInstance);

        this.removeAllChildren(this.app.rootElement.virtual);
        this.app.rootElement.virtual.appendChild(route.element.virtual);
    }

    private checkElementAlreadyRendered(element: HTMLElement, targetElement: HTMLElement) {
        if (element) {
            if (targetElement === this.app.rootElement.real) {
                for (var i = 0; i < targetElement.children.length; i++) {
                    let child = targetElement.children[i];
                    if (child === element)
                        return true;
                }
            }
            else {
                let routerElement = targetElement.querySelector('nimble-router');
                if (routerElement) {
                    for (var i = 0; i < routerElement.children.length; i++) {
                        let child = routerElement.children[i];
                        if (child === element)
                            return true;
                    }
                }
            }
        }
        return false;
    }

    private createPageElementAndResolve(template: string, pageInstance: any) {
        let virtualElement = this.createVirtualElement(template);
        this.directivesRender.resolveChildren(virtualElement.children, pageInstance);
        return virtualElement;
    }

    private createVirtualElement(html: string) {
        let element = document.createElement('nimble-page');
        element.innerHTML = html;
        return element
    }

    public removeAllChildren(element: Element) {
        if (element && element.children.length) {
            for (var i = 0; i < element.children.length; i++) {
                element.removeChild(element.children[i]);
            }
        }
    }

    public diffTreeElementsAndUpdateOld(oldTreeElments: HTMLElement, newTreeElements: HTMLElement) {
        if (oldTreeElments.outerHTML !== newTreeElements.outerHTML) {
            let diff = this.diffDOM.diff(oldTreeElments, newTreeElements)
            this.diffDOM.apply(oldTreeElments, diff);
        }
    }

    public resolveAndRenderRoute(currentRoute: Route) {
        let previousRoute = Router.previous;
        let rootElement = this.app.rootElement;
        let highestParentRoute = currentRoute.getHighestParentOrHimself();
        let commonParentRoute = previousRoute ? Router.getCommonParentOfTwoRoutes(currentRoute, previousRoute) : highestParentRoute;

        this.removeAllChildren(rootElement.virtual);
        rootElement.virtual.appendChild(highestParentRoute.element.virtual);

        this.removeAllChildren(rootElement.real);
        rootElement.real.appendChild(highestParentRoute.element.virtual);

        this.headerRender.resolveTitleAndMetaTags(currentRoute);

        this.checkNewRoutesRendered(commonParentRoute, highestParentRoute, currentRoute);
        this.checkOldRoutesRemoved(commonParentRoute, previousRoute);
    }

    private checkOldRoutesRemoved(commonParentRoute: Route, previousRoute: Route) {
        if (previousRoute) {
            let onlyOldRoutesRemoved: Route[] = [];

            for(let route of [previousRoute, ...previousRoute.getAllParents()]) {
                if (route === commonParentRoute)
                    break;
                onlyOldRoutesRemoved.push(route);
            }

            onlyOldRoutesRemoved.reverse().forEach((route) => {
                if (!route.pageInstance.isDestroyed) {
                    route.pageInstance.isDestroyed = true;
                    route.pageInstance.onDestroy();
                } 
            });
        }
    }

    private checkNewRoutesRendered(commonParentRoute: Route, highestParentRoute: Route, currentRoute: Route) {
        let onlyNewRoutesRendered: Route[] = [];

        if (commonParentRoute !== highestParentRoute && highestParentRoute !== currentRoute)
            for(let route of [currentRoute, ...currentRoute.getAllParents()]) {
                if (route === commonParentRoute)
                    break;
                onlyNewRoutesRendered.push(route);
            }
        else
            onlyNewRoutesRendered = [currentRoute, ...currentRoute.getAllParents()];

        onlyNewRoutesRendered.reverse().forEach((route) => {
            if (!route.pageInstance.isInitialized) {
                route.pageInstance.isInitialized = true;
                route.pageInstance.onInit();
            }
        });
    }
}