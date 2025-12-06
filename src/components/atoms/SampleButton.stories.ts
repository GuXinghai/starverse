import type { Meta, StoryObj } from '@storybook/vue3'
import SampleButton from './SampleButton.vue'

const meta = {
  title: 'Atoms/SampleButton',
  component: SampleButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline']
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg']
    },
    disabled: {
      control: 'boolean'
    }
  },
  args: {
    default: 'Button Text'
  }
} satisfies Meta<typeof SampleButton>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    variant: 'primary'
  },
  render: (args) => ({
    components: { SampleButton },
    setup() {
      return { args }
    },
    template: '<SampleButton v-bind="args">Primary Button</SampleButton>'
  })
}

export const Secondary: Story = {
  args: {
    variant: 'secondary'
  },
  render: (args) => ({
    components: { SampleButton },
    setup() {
      return { args }
    },
    template: '<SampleButton v-bind="args">Secondary Button</SampleButton>'
  })
}

export const Outline: Story = {
  args: {
    variant: 'outline'
  },
  render: (args) => ({
    components: { SampleButton },
    setup() {
      return { args }
    },
    template: '<SampleButton v-bind="args">Outline Button</SampleButton>'
  })
}

export const Sizes: Story = {
  render: () => ({
    components: { SampleButton },
    template: `
      <div class="flex gap-4 items-center">
        <SampleButton size="sm">Small</SampleButton>
        <SampleButton size="md">Medium</SampleButton>
        <SampleButton size="lg">Large</SampleButton>
      </div>
    `
  })
}

export const Disabled: Story = {
  args: {
    disabled: true
  },
  render: (args) => ({
    components: { SampleButton },
    setup() {
      return { args }
    },
    template: '<SampleButton v-bind="args">Disabled Button</SampleButton>'
  })
}
