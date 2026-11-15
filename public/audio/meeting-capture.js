/* global AudioWorkletProcessor, registerProcessor, sampleRate */
class MeetingCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(12 * sampleRate);
    this.length = 0;
    this.finished = false;
    this.port.onmessage = () => {
      this.finished = true;
      this.send();
      this.port.postMessage('finished');
    };
  }

  send() {
    if (!this.length) return;
    const chunk = this.samples.slice(0, this.length);
    this.port.postMessage(chunk, [chunk.buffer]);
    this.length = 0;
  }

  process(inputs) {
    if (this.finished) return false;
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const count = Math.min(this.samples.length - this.length, channel.length - offset);
      this.samples.set(channel.subarray(offset, offset + count), this.length);
      this.length += count;
      offset += count;
      if (this.length === this.samples.length) this.send();
    }
    return true;
  }
}

registerProcessor('diffmd-meeting-capture', MeetingCapture);
