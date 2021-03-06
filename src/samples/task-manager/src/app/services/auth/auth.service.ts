import { Router } from '@nimble-ts/core/route';
import { HttpClient } from '@nimble-ts/core/providers/http-client';
import { Injectable } from '@nimble-ts/core/inject';

@Injectable({
    single: true
})
export class AuthService {
    public get user() {
        const user = JSON.parse(localStorage.getItem('AuthUser'));
        if (user) return user;
        return null;
    }

    public get isLogged() { return this.user !== null; }

    constructor(
        private httpClient: HttpClient
    ) {
    }

    private setUser(user: any) {
        localStorage.setItem('AuthUser', JSON.stringify(user));
    }

    public login(form: { user: string, password: string }) {
        return new Promise<any>((resolve, reject) => {
            setTimeout(() => {
                this.setUser({
                    name: 'Eric Ferreira',
                    id: 123
                });
                resolve(true);
                // reject(false);
            }, 2000);
        });
    }

    logout() {
        localStorage.removeItem('AuthUser');
        Router.redirect('/login');
    }
}