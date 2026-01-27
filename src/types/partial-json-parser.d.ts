declare module "partial-json-parser" {
  /**
   * Parses a partial or incomplete JSON string.
   * @param jsonString The (potentially incomplete) JSON string to parse.
   */
  function partialParse(jsonString: string);
  export default partialParse;
}
