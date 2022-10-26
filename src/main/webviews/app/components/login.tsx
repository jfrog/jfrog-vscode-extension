import React, { ReactNode, useRef, useState } from 'react';
import Button from '../UI/Button';
import Card from '../UI/Card';

interface Props {
    children?: ReactNode;
}


const Login: (props: Props) => JSX.Element = () => {
    const [error, setError] = useState({
        title: '',
        message: ''
    });
    const usernameInputRef: React.RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);
    const urlInputRef: React.RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);
    const passwordInputRef: React.RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);
    const accessTokenInputRef: React.RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);

    const loginHandler: (event: any) => void = (event: any) => {
        event.preventDefault();
        const url: string | undefined = usernameInputRef.current?.value;
        // const username: string | undefined = usernameInputRef.current?.value;
        // const password: string | undefined = usernameInputRef.current?.value;
        // const accessToken: string | undefined = accessTokenInputRef.current?.value;
        if (!url || url.trim().length === 0) {
            setError({
                title: 'Invalid input',
                message: 'Please enter a valid name and age (non-empty values).'
            });
            return error;
        }
        return;
    };

    return (
        <>
            <Card className="input">
                <form onSubmit={loginHandler}>
                    <label htmlFor="url">Platform URL</label>
                    <input id="url" ref={urlInputRef} type="text" />
                    <label htmlFor="username">Username</label>
                    <input id="username" ref={usernameInputRef} type="text" />
                    <label htmlFor="username">Password</label>
                    <input id="password" ref={passwordInputRef} type="password" />
                    <label htmlFor="username">Access Token</label>
                    <input id="accessToken" ref={accessTokenInputRef} type="password" />
                    <Button type="submit">Login</Button>
                </form>
            </Card>
        </>
    );
};
export default Login;
