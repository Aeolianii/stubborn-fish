import type { ObjectGrounding } from "../domain/object-grounding.js";
import type {
  LocateObjectInput,
  ObjectLocator
} from "./ark-vision-client.js";
import { validateInputImage } from "./input-image.js";

export interface ObjectGroundingServiceContract {
  locate(input: LocateObjectInput): Promise<ObjectGrounding>;
}

export class ObjectGroundingService
  implements ObjectGroundingServiceContract
{
  constructor(private readonly locator: ObjectLocator) {}

  async locate(input: LocateObjectInput): Promise<ObjectGrounding> {
    await validateInputImage(input.image, input.mimeType);
    return this.locator.locateObject(input);
  }
}
