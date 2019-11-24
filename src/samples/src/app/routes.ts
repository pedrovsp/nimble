import RootPage from './pages/root-page/root-page';

export const ROUTES = [
    {
        path: '',
        page: RootPage,
        children: [
            {
                path: '',
                page: () => import('./pages/main-page/main-page'),
                children: [
                    {
                        isPriority: true,
                        path: 'home',
                        page: () => import('./pages/home-page/home-page')
                    },
                    {
                        path: 'about',
                        page: () => import('./pages/about-page/about-page')
                    },
                ]
            },
            {
                path: 'subscribe',
                page: () => import('./pages/subscribe-page/subscribe-page')
            }
        ]
    }
];