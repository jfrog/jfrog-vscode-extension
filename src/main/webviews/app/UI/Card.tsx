import React, { ReactNode } from 'react';

interface Props {
    className?: string;
    card?: string;
    children: ReactNode;
}

const Card: (props: Props) => JSX.Element = (props) => {
  return <div className={`${props.className}`}>{props.children}</div>;
};

export default Card;