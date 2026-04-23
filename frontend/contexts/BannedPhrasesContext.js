/**
 * BannedPhrasesContext — provides banned-phrase data + fix callback to
 * section editors without changing the (data, update) tab-render signature.
 *
 * The provider is placed in draft/[id].js; section editors consume via
 * useBannedPhrases().
 */

import { createContext, useContext } from 'react';

const BannedPhrasesContext = createContext({ phrases: [], fixPhrase: () => {} });

export function BannedPhrasesProvider({ phrases, fixPhrase, children }) {
  return (
    <BannedPhrasesContext.Provider value={{ phrases: phrases || [], fixPhrase }}>
      {children}
    </BannedPhrasesContext.Provider>
  );
}

export function useBannedPhrases() {
  return useContext(BannedPhrasesContext);
}

export default BannedPhrasesContext;
