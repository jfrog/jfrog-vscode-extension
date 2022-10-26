import React, { ReactNode } from 'react';

interface Props {
    type?:  "button" | "submit" | "reset" | undefined;
    classes?: string;
    ico?: string;
    onClick?: () => void;
    children: ReactNode;
    disabled?: boolean;
}

const Button: (props: Props) => JSX.Element = (props: Props) => {
    return (
        <button type={props.type || 'button'} className={props.classes} onClick={props.onClick} disabled={props.disabled}>
            <i className={props.ico}></i>
            {props.children}
        </button>
    );
};

export default Button;
