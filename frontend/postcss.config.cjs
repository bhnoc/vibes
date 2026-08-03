/**
 * The design system ships as plain CSS custom properties following shadcn's
 * Tailwind v4 token names, but nothing in this app writes utility classes and no
 * stylesheet carries an @tailwind directive. Running Tailwind here scanned the
 * whole source tree every build to emit nothing, so it is gone. Autoprefixer
 * stays for the vendor prefixes the kit relies on.
 */
module.exports = {
  plugins: {
    autoprefixer: {},
  },
}
