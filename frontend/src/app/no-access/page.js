import Image from 'next/image'
import React from 'react'
import protection from '@/assets/protection.svg'
import styles from "@/styles/components/Common.module.scss"

const NoAccess = () => {
  return (
    <div className={styles.noAccessContainer}>
        <Image
        src={protection}
        alt="No Access"
        width={300}
        height={300}
        className={styles.noAccessImage}
        />
        <h1>You are on the waitlist!</h1>
        <p>Exciting things are on the horizon! Stay tuned, and we&apos;ll keep you updated on your access to Pentest Copilot. Thank you for your interest!!</p>
        </div>
  )
}

export default NoAccess